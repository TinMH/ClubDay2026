/**
 * TRỌNG TÀI của game Vẽ hình nhanh.
 *
 * Nguyên tắc: client gửi TOẠ ĐỘ NÉT, server tự rasterize rồi tự nhận diện. Không
 * có đường nào để client gửi lên một tấm ảnh không phải do mình vẽ, và không có
 * field điểm nào trong request.
 *
 * ĐIỂM CHỈ SINH RA LÚC NỘP BÀI.
 *
 * Trước đây hễ model đọc ra hình đúng là cho điểm ngay: người chơi đang vẽ dở,
 * chưa định nộp gì cả, bỗng thấy màn hình báo thắng — vì model nhận ra một nét
 * nguệch ngoạc tình cờ lọt top-3. Nay mỗi giây client vẫn gửi một frame, nhưng
 * frame chỉ trả về GỢI Ý ("AI nghĩ: …") và KHÔNG bao giờ cho điểm.
 *
 * Điểm được chấm ở đúng một thời điểm, cho đúng một lần:
 *   - người chơi bấm NỘP BÀI      → `commitReason = 'button'`
 *   - hết giờ                      → `commitReason = 'timeout'`, server tự nộp
 *
 * Mọi hàm nhận `now` như THAM SỐ để test giả lập được "đã hết 15 giây" mà không
 * phải chờ thật.
 */
import { tooFast } from '../lib/rate-limit.js';
import { syncRoundStatus } from '../store/lobby.js';
import { touch } from '../store/store.js';
import {
  DURATION_MS,
  MIN_FRAME_GAP_MS,
  type Player,
  type Prediction,
  type Round,
} from '../store/types.js';
import { accepted } from './labels.js';
import { rasterize, type Stroke } from './raster.js';

/** Điểm khi nộp bài đúng: `150 − số giây đã dùng`. Nộp càng sớm điểm càng cao. */
export const SOLVE_BASE_SCORE = 150;

/**
 * Quãng ÂN HẠN sau mốc hết giờ.
 *
 * Bài nộp thật của client gần như luôn tới sau `endsAt` vài trăm ms: đồng hồ đếm
 * ngược chạm 0 rồi request mới đi, mà đồng hồ nền của server thì quét mỗi 500ms.
 * Không có quãng này thì mọi bài nộp đúng lúc hết giờ đều bị trả TIME_UP, và cả
 * lượt không ai có điểm.
 *
 * Nộp trong quãng này KHÔNG được lợi: số giây luôn bị kẹp ở độ dài lượt, nên vẽ
 * thêm sau mốc hết giờ cũng chỉ nhận đúng số điểm như nộp tại mốc.
 */
export const SUBMIT_GRACE_MS = 2_500;

/**
 * Hàm nhận diện, TIÊM TỪ NGOÀI vào.
 *
 * Nhờ vậy `draw-session` test được mà không cần nạp model ONNX (700ms + native
 * binary) trong bộ unit test. Route truyền hàm thật vào.
 */
export type ClassifyFn = (px: Uint8Array, topK?: number) => Promise<Prediction[]>;

/**
 * Nét vẽ GẦN NHẤT mà server đã nhận của từng người.
 *
 * Vì sao không để trong `Player`: đây là DỮ LIỆU ĐẦU VÀO, không phải kết quả.
 * Nhét vào Player là mỗi 5 giây ghi snapshot lại đẩy vài chục KB nét vẽ xuống
 * đĩa, mà lượt khôi phục xong cũng chỉ để xem lại.
 *
 * Nhờ có nó mà server tự nộp được bài cho người chơi đã treo tab: chiếc điện
 * thoại đó không gửi nổi request nào nữa, nhưng hình nó vẽ tới giây thứ 14 vẫn
 * còn ở đây. Xoá ngay khi bài được chấm để RAM không phình theo số lượt.
 */
const snapshots = new Map<string, readonly Stroke[]>();

/** Số thứ tự frame do client đếm. Phải TĂNG DẦN — xem chốt 4 ở `previewFrame`. */
export interface FrameInput {
  seq: number;
  strokes: readonly Stroke[];
}

export type FailCode = 'NOT_PLAYING' | 'TIME_UP' | 'TOO_FAST' | 'SEQUENCE' | 'NO_TARGET';

export interface PreviewOk {
  ok: true;
  /**
   * GỢI Ý, không phải kết quả: model đang đọc hình này ra đúng từ khoá.
   *
   * Dùng để client nói "AI đã nhận ra, nộp được rồi" — nhưng điểm KHÔNG phụ thuộc
   * giá trị này. Cùng một tấm hình, người chơi nộp lúc nào thì điểm tính lúc đó.
   */
  hint: boolean;
  top: Prediction[];
  /** Điểm HIỆN TẠI của người chơi — chưa nộp thì vẫn là 0. */
  score: number;
  /** Giây đã dùng tính từ lúc bắt đầu lượt — server đo, không tin client. */
  seconds: number;
  endsAt: number | null;
}

export type PreviewOutcome = PreviewOk | { ok: false; code: FailCode };

export interface CommitOk {
  ok: true;
  /** true = bài này ĐÃ được chấm từ trước; lần gọi này không chấm lại. */
  already: boolean;
  /** Do SERVER suy ra từ đồng hồ của nó, không nhận từ client. */
  reason: 'button' | 'timeout';
  matched: boolean;
  top: Prediction[];
  score: number;
  seconds: number;
  endsAt: number | null;
}

export type CommitOutcome = CommitOk | { ok: false; code: FailCode };

/**
 * Nhận một frame vẽ và trả về GỢI Ý — KHÔNG chấm điểm.
 *
 * Các chốt, theo đúng thứ tự kiểm tra:
 *   1. Lượt phải đang chơi và người này chưa xong.
 *   2. Còn trong thời gian — hết giờ thì không nhận frame nữa.
 *   3. Không gửi nhanh hơn 1 frame/giây — để một người không chiếm hết CPU của model.
 *   4. `seq` phải TĂNG DẦN: chặn gửi lại frame cũ.
 *   5. Từ khoá lấy từ `round.target` do server chọn, không bao giờ từ client.
 *
 * Toàn bộ phần kiểm tra chạy ĐỒNG BỘ trước `await classify` — nên hai frame gửi
 * cùng lúc cho cùng một người chơi sẽ bị chốt 3 hoặc 4 chặn, không cùng lọt qua.
 */
export async function previewFrame(
  round: Round,
  player: Player,
  frame: FrameInput,
  now: number,
  classify: ClassifyFn,
): Promise<PreviewOutcome> {
  const target = round.target;
  if (!target) return { ok: false, code: 'NO_TARGET' };

  if (round.status !== 'playing' || player.finished) return { ok: false, code: 'NOT_PLAYING' };

  if (round.endsAt !== null && now > round.endsAt) {
    player.finished = true;
    syncRoundStatus(round, now);
    return { ok: false, code: 'TIME_UP' };
  }

  // Chỉ TỪ CHỐI, KHÔNG đánh cờ gian lận.
  //
  // Chốt này giữ tải cho model, không phải chốt chống gian lận: frame không sinh
  // ra điểm nào (điểm chỉ đến từ `commitDrawing`), nên gửi dày hơn chẳng lợi gì.
  // Mà khoảng cách đo theo GIỜ NHẬN, nên wifi giật một nhịp là hai frame gửi
  // đúng nhịp vẫn tới sát nhau — đánh cờ ở đây là bêu một người chơi thật vì
  // mạng của họ chập, đổi lại không chặn được gì.
  if (tooFast(player.lastFrameAt, now, MIN_FRAME_GAP_MS)) {
    return { ok: false, code: 'TOO_FAST' };
  }

  if (frame.seq <= player.seq) return { ok: false, code: 'SEQUENCE' };

  // Từ đây trở đi là đã TIÊU thụ frame: ghi mốc thời gian và seq trước khi
  // `await`, để frame gửi chồng lên không lách được qua chốt 3/4.
  player.lastFrameAt = now;
  player.seq = frame.seq;

  const seconds = secondsSince(round, now);

  // Nhớ nét mới nhất — kể cả khi RỖNG (người chơi vừa xoá hết), vì lúc tự nộp
  // server phải chấm đúng những gì còn trên canvas chứ không phải bản cũ hơn.
  snapshots.set(player.id, frame.strokes);

  // Canvas trống: không tốn 3ms inference cho một tấm ảnh đen thui, và cũng
  // không được coi là lỗi — người chơi vừa xoá để vẽ lại.
  const px = rasterize(frame.strokes);
  if (isBlank(px)) {
    return { ok: true, hint: false, top: [], score: player.score, seconds, endsAt: round.endsAt };
  }

  const top = await classify(px, 3);
  if (top[0]) player.lastGuess = top[0];

  return {
    ok: true,
    hint: accepted(top, target.id),
    top,
    score: player.score,
    seconds,
    endsAt: round.endsAt,
  };
}

export interface CommitInput {
  /**
   * Nét MỚI NHẤT từ client.
   * Bỏ trống (`undefined`) = chấm bằng nét server đã nhận được ở frame gần nhất.
   * Còn `[]` = người chơi NỘP một canvas trống, và bị chấm 0 điểm thật.
   */
  strokes?: readonly Stroke[];
  /**
   * Bỏ qua quãng ÂN HẠN. CHỈ dùng cho đường TỰ NỘP của server.
   *
   * Quãng ân hạn tồn tại để bài nộp của client kịp tới, và đường tự nộp thì chạy
   * SAU khi quãng đó hết — nên nếu nó cũng bị chốt thời gian thì không bao giờ
   * chấm được ai. Đây không phải cửa hậu cho client: nó là tham số của hàm nội
   * bộ, không route nào truyền từ request vào.
   */
  force?: boolean;
}

/** Bài đang được chấm dở của từng người — xem chốt chống bấm đúp ở `commitDrawing`. */
const inFlight = new Map<string, Promise<CommitOutcome>>();

/**
 * NỘP BÀI: chấm điểm đúng một lần cho người chơi.
 *
 * Chốt, theo đúng thứ tự kiểm tra:
 *   1. Lượt phải có từ khoá (server chọn, không phải client).
 *   2. Lượt chưa bắt đầu thì từ chối; đang chơi HOẶC vừa mới hết giờ (trong quãng
 *      ân hạn) thì nhận.
 *   3. Quá quãng ân hạn → TIME_UP. Tới lúc đó bài đã được tự nộp rồi, nên nhánh
 *      này chỉ còn là lưới an toàn.
 *   4. Đã chấm rồi → trả lại ĐÚNG kết quả cũ, không tốn thêm lần inference nào.
 *   5. Đang chấm dở (bấm đúp) → chờ chung kết quả với lần gọi đầu.
 *
 * Điểm do server tính từ đồng hồ của server. Số giây bị KẸP ở độ dài lượt, nên
 * nộp muộn (trong ân hạn) không thể ăn điểm cao hơn nộp đúng mốc.
 */
export function commitDrawing(
  round: Round,
  player: Player,
  input: CommitInput,
  now: number,
  classify: ClassifyFn,
): Promise<CommitOutcome> {
  if (!round.target) return Promise.resolve({ ok: false, code: 'NO_TARGET' });

  // Đã chấm rồi: trả lại kết quả cũ. Client tự nộp lúc 0 giây rất có thể tới sau
  // khi server đã tự nộp xong — lúc đó câu trả lời phải là "bạn được N điểm",
  // không phải một mã lỗi.
  if (player.committed) return Promise.resolve(cachedResult(round, player));

  // Bấm đúp (hoặc mạng chậm bắn lại): hai request cùng lúc cho cùng một người.
  // Cái thứ hai chờ chung kết quả với cái thứ nhất thay vì chấm lại — nếu không
  // thì tốn hai lần inference cho cùng một bài và hai bên có thể ghi đè nhau.
  const running = inFlight.get(player.id);
  if (running) return running;

  const run = grade(round, player, input, now, classify).finally(() => inFlight.delete(player.id));
  inFlight.set(player.id, run);
  return run;
}

async function grade(
  round: Round,
  player: Player,
  input: CommitInput,
  now: number,
  classify: ClassifyFn,
): Promise<CommitOutcome> {
  // Toàn bộ kiểm tra chạy ĐỒNG BỘ trước `await classify`.
  if (round.endsAt === null) return { ok: false, code: 'NOT_PLAYING' };
  if (!input.force && now > round.endsAt + SUBMIT_GRACE_MS) {
    return { ok: false, code: 'TIME_UP' };
  }

  const target = round.target;
  if (!target) return { ok: false, code: 'NO_TARGET' };

  // Nộp sau mốc hết giờ = tự nộp. Client không khai được điều này.
  const reason: CommitOk['reason'] = now > round.endsAt ? 'timeout' : 'button';
  const seconds = secondsSince(round, now);

  const strokes = input.strokes ?? snapshots.get(player.id) ?? [];
  const px = rasterize(strokes);

  let top: Prediction[] = [];
  let matched = false;

  if (!isBlank(px)) {
    top = await classify(px, 3);
    if (top[0]) player.lastGuess = top[0];
    matched = accepted(top, target.id);
  }

  player.score = matched ? Math.max(0, SOLVE_BASE_SCORE - seconds) : 0;
  player.solved = matched;
  player.solvedAt = now;
  player.committed = true;
  player.commitReason = reason;
  player.committedAt = now;
  player.finished = true;

  snapshots.delete(player.id); // bài đã chấm → không giữ nét vẽ nữa
  touch(round);
  syncRoundStatus(round, now); // cả 5 người nộp xong → kết thúc lượt sớm

  return {
    ok: true,
    already: false,
    reason,
    matched,
    top,
    score: player.score,
    seconds,
    endsAt: round.endsAt,
  };
}

/** Kết quả của một bài ĐÃ chấm — dựng lại từ `Player`, không chấm lại. */
function cachedResult(round: Round, player: Player): CommitOk {
  return {
    ok: true,
    already: true,
    reason: player.commitReason ?? 'button',
    matched: player.solved,
    // Bài đã chấm rồi thì client không cần top-3 nữa; nhớ được dự đoán đầu là đủ.
    top: player.lastGuess ? [player.lastGuess] : [],
    score: player.score,
    seconds: secondsSince(round, player.committedAt ?? Date.now()),
    endsAt: round.endsAt,
  };
}

/**
 * TỰ NỘP cho những ai chưa bấm nút. Chạy sau khi lượt đã kết thúc.
 *
 * Đây là chỗ giữ đúng lời hứa "hết thời gian thì tự động nộp và chấm điểm" mà
 * KHÔNG cần client hợp tác: điện thoại treo tab, mất mạng, hay người chơi cố tình
 * không bấm — server vẫn chấm bài bằng nét vẽ cuối cùng nó nhận được.
 *
 * @returns số bài vừa được chấm.
 */
export async function finalizeStragglers(
  round: Round,
  now: number,
  classify: ClassifyFn,
): Promise<number> {
  let graded = 0;
  for (const player of round.players.values()) {
    if (player.committed) continue;
    const outcome = await commitDrawing(round, player, { force: true }, now, classify);
    if (outcome.ok && !outcome.already) graded += 1;
  }
  return graded;
}

/**
 * Số giây đã trôi qua kể từ lúc bắt đầu lượt (làm tròn LÊN), KẸP ở độ dài lượt.
 *
 * Kẹp là chuyện công bằng: nộp trong quãng ân hạn thì số giây thật đã là 15.3,
 * nhưng vẽ thêm được sau mốc hết giờ thì cũng không được nhận thêm điểm.
 */
function secondsSince(round: Round, now: number): number {
  const start = round.startedAt ?? round.createdAt;
  const elapsed = Math.max(0, Math.ceil((now - start) / 1000));
  return Math.min(elapsed, Math.round(DURATION_MS[round.game] / 1000));
}

/** Ảnh không có mực nào = canvas trống. */
function isBlank(px: Uint8Array): boolean {
  for (const v of px) if (v > 0) return false;
  return true;
}
