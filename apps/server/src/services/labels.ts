/**
 * Từ khoá cho game Vẽ hình nhanh: chọn từ khoá, tha lỗi nhận diện, xếp hạng.
 *
 * Hai danh sách ở đây có nguồn gốc KHÁC NHAU, đừng lẫn:
 *
 *   - `ALLOWLIST` (allowlist.generated.ts) — model nhận đủ tốt không. ĐO ĐƯỢC,
 *     không được sửa tay; muốn đổi thì chạy lại `npm run eval:model`.
 *   - `LABEL_VI` (file này) — tên tiếng Việt để hiển thị. Đây là bản dịch, không
 *     phải số đo, nên viết tay là đúng.
 *
 * Từ khoá dùng được = giao của hai danh sách.
 */
import { mulberry32 } from '../lib/prng.js';
import { ALLOWLIST, CONFUSIONS } from './allowlist.generated.js';
import type { Prediction } from '../store/types.js';

export interface Target {
  /** Tên class trong model (tiếng Anh) — khoá để tra bảng nhầm lẫn. */
  id: string;
  /** Tên hiển thị cho người chơi. */
  labelVi: string;
}

/**
 * Tên tiếng Việt của những hình ĐÁNG để chơi.
 *
 * Tiêu chí chọn: vẽ được trong 15 giây, tên tiếng Việt rõ ràng không lẫn, và
 * model đã nhận đủ tốt. Mấy thứ như "bridge" hay "hourglass" model nhận tốt
 * nhưng 15 giây thì không ai vẽ xong, nên không có ở đây.
 */
const LABEL_VI: Record<string, string> = {
  airplane: 'máy bay',
  'alarm clock': 'đồng hồ báo thức',
  ant: 'con kiến',
  apple: 'quả táo',
  banana: 'quả chuối',
  basketball: 'quả bóng rổ',
  bee: 'con ong',
  bicycle: 'xe đạp',
  butterfly: 'con bướm',
  cactus: 'cây xương rồng',
  candle: 'cây nến',
  car: 'ô tô',
  castle: 'lâu đài',
  cat: 'con mèo',
  circle: 'hình tròn',
  cloud: 'đám mây',
  cookie: 'bánh quy',
  crab: 'con cua',
  crown: 'vương miện',
  donut: 'bánh vòng',
  elephant: 'con voi',
  envelope: 'phong bì',
  eyeglasses: 'kính',
  eye: 'con mắt',
  fish: 'con cá',
  flower: 'bông hoa',
  giraffe: 'hươu cao cổ',
  guitar: 'đàn ghi-ta',
  hamburger: 'bánh hamburger',
  hand: 'bàn tay',
  hat: 'cái mũ',
  helicopter: 'trực thăng',
  horse: 'con ngựa',
  house: 'ngôi nhà',
  'ice cream': 'kem',
  key: 'chìa khoá',
  laptop: 'máy tính xách tay',
  leaf: 'chiếc lá',
  'light bulb': 'bóng đèn',
  lightning: 'tia chớp',
  lollipop: 'kẹo mút',
  mountain: 'ngọn núi',
  mushroom: 'cây nấm',
  octopus: 'con bạch tuộc',
  owl: 'con cú',
  'palm tree': 'cây dừa',
  parachute: 'cái dù',
  pear: 'quả lê',
  penguin: 'chim cánh cụt',
  piano: 'đàn piano',
  pig: 'con lợn',
  pineapple: 'quả dứa',
  pizza: 'bánh pizza',
  rabbit: 'con thỏ',
  rainbow: 'cầu vồng',
  sailboat: 'thuyền buồm',
  scissors: 'cái kéo',
  shark: 'cá mập',
  shoe: 'chiếc giày',
  skateboard: 'ván trượt',
  'smiley face': 'mặt cười',
  snail: 'con ốc sên',
  snake: 'con rắn',
  snowman: 'người tuyết',
  'soccer ball': 'quả bóng đá',
  spider: 'con nhện',
  square: 'hình vuông',
  star: 'ngôi sao',
  strawberry: 'quả dâu tây',
  sun: 'mặt trời',
  't-shirt': 'áo phông',
  teapot: 'ấm trà',
  'teddy-bear': 'gấu bông',
  television: 'cái ti vi',
  tent: 'cái lều',
  train: 'tàu hoả',
  tree: 'cái cây',
  triangle: 'hình tam giác',
  umbrella: 'cái ô',
  whale: 'cá voi',
};

const allowed = new Set(ALLOWLIST);

/**
 * Những khoá có tên tiếng Việt nhưng model nhận KHÔNG đủ tốt.
 *
 * Bị loại khỏi game chứ không làm sập server: một từ khoá viết sai chính tả
 * hoặc bị model đánh tụt hạng không được phép làm hỏng cả sự kiện. Có test
 * khẳng định danh sách này RỖNG — sai thì lộ ra lúc CI, không phải lúc chơi.
 */
export const DROPPED: readonly string[] = Object.keys(LABEL_VI).filter((id) => !allowed.has(id));

/** Từ khoá dùng được, xếp theo tên tiếng Việt cho dễ tra. */
export const TARGETS: readonly Target[] = Object.keys(LABEL_VI)
  .filter((id) => allowed.has(id))
  .sort((a, b) => (LABEL_VI[a] as string).localeCompare(LABEL_VI[b] as string, 'vi'))
  .map((id) => ({ id, labelVi: LABEL_VI[id] as string }));

/**
 * Băm mã lượt → seed. Cùng mã lượt luôn ra cùng từ khoá, nên tra lại được
 * "lượt ABC hỏi hình gì" mà không cần lưu gì thêm.
 */
function hashRoundId(roundId: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < roundId.length; i++) {
    h ^= roundId.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

/**
 * Chọn từ khoá cho một lượt. CẢ NĂM người trong lượt vẽ CÙNG một hình — nếu mỗi
 * người một hình thì không so điểm được nữa.
 */
export function pickTarget(roundId: string): Target {
  if (TARGETS.length === 0) throw new Error('Không còn từ khoá nào dùng được');

  const rnd = mulberry32(hashRoundId(roundId));
  const idx = Math.min(TARGETS.length - 1, Math.floor(rnd() * TARGETS.length));
  return TARGETS[idx] as Target;
}

export function labelVi(id: string): string {
  return LABEL_VI[id] ?? id;
}

/**
 * Ngưỡng tự tin để KHÔNG tha lỗi ở bước 2.
 *
 * Model chắc 90% đây là "cá mập" thì nó thật sự nhìn thấy cá mập; tha ở mức đó
 * là bắt đầu nhận bừa.
 */
const DISTRUST_SCORE = 0.85;

/**
 * Chấp nhận kết quả nhận diện cho `targetId`?
 *
 * Ba mức, từ chặt tới lỏng:
 *   1. Đoán trúng ngay ở top-1.
 *   2. Nằm trong top-3 VÀ model chưa quá tự tin vào nhãn nó đoán sai.
 *   3. Nhãn model đoán là cặp HAY LẪN NHAU ĐO ĐƯỢC với từ khoá (fish↔whale,
 *      cat↔pig, house↔barn…). Không đặt thêm trần tự tin ở đây: bảng đó chỉ
 *      chứa những cặp đã đo được là lẫn nhau ≥ 10% số mẫu, nên tha là đúng —
 *      và người chơi vẽ "con cá" mà bị bắt vì model gọi "cá mập" thì đó là lỗi
 *      của game, không phải của họ.
 *
 * Đo được: top-1 đơn thuần đạt 74.4% trên toàn bộ 345 class. Chơi mà cứ 4 lần
 * vẽ đúng thì 1 lần bị báo sai là trải nghiệm tệ, nên mới có mức 2 và 3.
 */
export function accepted(top: readonly Prediction[], targetId: string): boolean {
  const best = top[0];
  if (!best) return false;

  if (best.label === targetId) return true;

  if (best.score < DISTRUST_SCORE && top.slice(0, 3).some((p) => p.label === targetId)) {
    return true;
  }

  return (CONFUSIONS[targetId] ?? []).includes(best.label);
}
