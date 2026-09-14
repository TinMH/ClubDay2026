/**
 * SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
 *
 * Sinh bởi:  npm run eval:model
 * Đo lúc:    2026-09-14
 * Model:     Xenova/quickdraw-mobilevit-small @ fp32
 * Mẫu:       20 hình THẬT mỗi class, lấy từ QuickDraw
 *            full/raw — đúng phân bố của lúc chơi (nét vẽ tay, không phải ảnh
 *            đã rasterize sẵn của Google).
 * Ngưỡng:    top-1 ≥ 0.65
 *
 * ALLOWLIST là SỐ ĐO, không phải danh sách chọn tay. Sửa nó mà không chạy lại
 * `npm run eval:model` nghĩa là đang đoán — và model thì không đoán theo bạn.
 *
 * Muốn thêm từ khoá cho game: chạy lại eval, đừng thêm tay.
 */

/** Ngày đo + tham số, để biết số liệu cũ tới mức nào. */
export const EVAL_META = {
  measuredAt: '2026-09-14',
  model: 'Xenova/quickdraw-mobilevit-small',
  dtype: 'fp32',
  samplesPerClass: 20,
  threshold: 0.65,
} as const;

/** Class mà model nhận đúng ≥ 0.65 ở top-1. Chỉ những class này được làm từ khoá. */
export const ALLOWLIST: readonly string[] = [
  "banana",
  "butterfly",
  "cactus",
  "fireplace",
  "hamburger",
  "helicopter",
  "ice cream",
  "ladder",
  "sink",
  "snail",
  "star",
  "t-shirt",
  "washing machine",
  "airplane",
  "envelope",
  "eyeglasses",
  "floor lamp",
  "flower",
  "hat",
  "jail",
  "mermaid",
  "picture frame",
  "sheep",
  "spoon",
  "swing set",
  "tennis racquet",
  "The Eiffel Tower",
  "The Mona Lisa",
  "umbrella",
  "wine glass",
  "angel",
  "ant",
  "apple",
  "bee",
  "calendar",
  "carrot",
  "church",
  "circle",
  "drill",
  "flashlight",
  "garden",
  "goatee",
  "hammer",
  "hand",
  "kangaroo",
  "lollipop",
  "nose",
  "octopus",
  "palm tree",
  "popsicle",
  "rain",
  "rainbow",
  "sailboat",
  "scorpion",
  "sea turtle",
  "shoe",
  "shorts",
  "snowflake",
  "snowman",
  "square",
  "syringe",
  "television",
  "wine bottle",
  "wristwatch",
  "alarm clock",
  "anvil",
  "bandage",
  "basketball",
  "bat",
  "bulldozer",
  "camel",
  "campfire",
  "candle",
  "car",
  "castle",
  "chandelier",
  "cookie",
  "crab",
  "cruise ship",
  "donut",
  "door",
  "ear",
  "fish",
  "flying saucer",
  "frying pan",
  "giraffe",
  "grass",
  "harp",
  "headphones",
  "hedgehog",
  "hospital",
  "house plant",
  "jacket",
  "key",
  "knee",
  "laptop",
  "leaf",
  "light bulb",
  "lighter",
  "line",
  "lipstick",
  "mountain",
  "mushroom",
  "necklace",
  "octagon",
  "parachute",
  "rabbit",
  "saxophone",
  "see saw",
  "soccer ball",
  "sock",
  "stairs",
  "submarine",
  "sun",
  "table",
  "teapot",
  "teddy-bear",
  "toilet",
  "tractor",
  "tree",
  "waterslide",
  "animal migration",
  "arm",
  "baseball bat",
  "baseball",
  "binoculars",
  "calculator",
  "cat",
  "chair",
  "crocodile",
  "diamond",
  "dresser",
  "drums",
  "elephant",
  "eye",
  "fire hydrant",
  "fork",
  "hot air balloon",
  "house",
  "lightning",
  "megaphone",
  "ocean",
  "owl",
  "peanut",
  "pear",
  "pig",
  "pineapple",
  "remote control",
  "rifle",
  "roller coaster",
  "skateboard",
  "skyscraper",
  "smiley face",
  "stitches",
  "stop sign",
  "stove",
  "tent",
  "tooth",
  "toothbrush",
  "traffic light",
  "triangle",
  "asparagus",
  "backpack",
  "beard",
  "bicycle",
  "boomerang",
  "bottlecap",
  "brain",
  "bridge",
  "broom",
  "camera",
  "cannon",
  "clock",
  "cloud",
  "cow",
  "crown",
  "dumbbell",
  "elbow",
  "flip flops",
  "grapes",
  "hot dog",
  "hourglass",
  "map",
  "microwave",
  "mouth",
  "mug",
  "paint can",
  "pants",
  "paper clip",
  "penguin",
  "potato",
  "power outlet",
  "purse",
  "rake",
  "rollerskates",
  "sandwich",
  "saw",
  "scissors",
  "screwdriver",
  "skull",
  "squirrel",
  "strawberry",
  "sword",
  "tornado",
  "train",
  "vase",
  "whale",
  "wheel",
  "zebra",
  "zigzag",
  "ambulance",
  "axe",
  "basket",
  "bathtub",
  "bed",
  "blueberry",
  "book",
  "bowtie",
  "bracelet",
  "broccoli",
  "ceiling fan",
  "computer",
  "couch",
  "feather",
  "fence",
  "firetruck",
  "flamingo",
  "guitar",
  "horse",
  "lighthouse",
  "lion",
  "matches",
  "monkey",
  "motorbike",
  "onion",
  "paintbrush",
  "passport",
  "pizza",
  "rhinoceros",
  "shark",
  "shovel",
  "snake",
  "speedboat",
  "spider",
  "stethoscope",
  "swan",
  "sweater",
  "toaster",
  "toe",
  "underwear",
  "barn",
  "belt",
  "bucket",
  "cake",
  "cell phone",
  "compass",
  "dishwasher",
  "diving board",
  "duck",
  "face",
  "finger",
  "golf club",
  "helmet",
  "hot tub",
  "knife",
  "lobster",
  "mailbox",
  "microphone",
  "moustache",
  "panda",
  "peas",
  "piano",
  "radio",
  "sleeping bag",
  "snorkel",
  "streetlight",
  "toothpaste",
  "violin",
  "watermelon",
  "windmill"
];

/** Accuracy top-1 đo được của MỌI class đã đo — vết để soi lại, không dùng lúc chạy. */
export const MEASURED_TOP1: Readonly<Record<string, number>> = {
  "aircraft carrier": 0.15,
  "ambulance": 0.7,
  "airplane": 0.95,
  "alarm clock": 0.85,
  "animal migration": 0.8,
  "angel": 0.9,
  "ant": 0.9,
  "anvil": 0.85,
  "apple": 0.9,
  "arm": 0.8,
  "asparagus": 0.75,
  "axe": 0.7,
  "backpack": 0.75,
  "banana": 1,
  "bandage": 0.85,
  "barn": 0.65,
  "baseball bat": 0.8,
  "baseball": 0.8,
  "basket": 0.7,
  "basketball": 0.85,
  "bat": 0.85,
  "bathtub": 0.7,
  "beach": 0.55,
  "bear": 0.45,
  "beard": 0.75,
  "bed": 0.7,
  "bee": 0.9,
  "belt": 0.65,
  "bench": 0.4,
  "bicycle": 0.75,
  "binoculars": 0.8,
  "bird": 0.4,
  "birthday cake": 0.4,
  "blackberry": 0.55,
  "blueberry": 0.7,
  "book": 0.7,
  "boomerang": 0.75,
  "bottlecap": 0.75,
  "bowtie": 0.7,
  "bracelet": 0.7,
  "brain": 0.75,
  "bread": 0.5,
  "bridge": 0.75,
  "broccoli": 0.7,
  "broom": 0.75,
  "bucket": 0.65,
  "bulldozer": 0.85,
  "bus": 0.55,
  "bush": 0.55,
  "butterfly": 1,
  "cactus": 1,
  "cake": 0.65,
  "calculator": 0.8,
  "calendar": 0.9,
  "camel": 0.85,
  "camera": 0.75,
  "camouflage": 0.55,
  "campfire": 0.85,
  "candle": 0.85,
  "cannon": 0.75,
  "canoe": 0.5,
  "car": 0.85,
  "carrot": 0.9,
  "castle": 0.85,
  "cat": 0.8,
  "ceiling fan": 0.7,
  "cell phone": 0.65,
  "cello": 0.55,
  "chair": 0.8,
  "chandelier": 0.85,
  "church": 0.9,
  "circle": 0.9,
  "clarinet": 0.6,
  "clock": 0.75,
  "cloud": 0.75,
  "coffee cup": 0.6,
  "compass": 0.65,
  "computer": 0.7,
  "cookie": 0.85,
  "cooler": 0.45,
  "couch": 0.7,
  "cow": 0.75,
  "crab": 0.85,
  "crayon": 0.5,
  "crocodile": 0.8,
  "crown": 0.75,
  "cruise ship": 0.85,
  "cup": 0.55,
  "diamond": 0.8,
  "dishwasher": 0.65,
  "diving board": 0.65,
  "dog": 0.5,
  "dolphin": 0.5,
  "donut": 0.85,
  "door": 0.85,
  "dragon": 0.6,
  "dresser": 0.8,
  "drill": 0.9,
  "drums": 0.8,
  "duck": 0.65,
  "dumbbell": 0.75,
  "ear": 0.85,
  "elbow": 0.75,
  "elephant": 0.8,
  "envelope": 0.95,
  "eraser": 0.55,
  "eye": 0.8,
  "eyeglasses": 0.95,
  "face": 0.65,
  "fan": 0.6,
  "feather": 0.7,
  "fence": 0.7,
  "finger": 0.65,
  "fire hydrant": 0.8,
  "fireplace": 1,
  "firetruck": 0.7,
  "fish": 0.85,
  "flamingo": 0.7,
  "flashlight": 0.9,
  "flip flops": 0.75,
  "floor lamp": 0.95,
  "flower": 0.95,
  "flying saucer": 0.85,
  "foot": 0.6,
  "fork": 0.8,
  "frog": 0.55,
  "frying pan": 0.85,
  "garden hose": 0.25,
  "garden": 0.9,
  "giraffe": 0.85,
  "goatee": 0.9,
  "golf club": 0.65,
  "grapes": 0.75,
  "grass": 0.85,
  "guitar": 0.7,
  "hamburger": 1,
  "hammer": 0.9,
  "hand": 0.9,
  "harp": 0.85,
  "hat": 0.95,
  "headphones": 0.85,
  "hedgehog": 0.85,
  "helicopter": 1,
  "helmet": 0.65,
  "hexagon": 0.55,
  "hockey puck": 0.6,
  "hockey stick": 0.55,
  "horse": 0.7,
  "hospital": 0.85,
  "hot air balloon": 0.8,
  "hot dog": 0.75,
  "hot tub": 0.65,
  "hourglass": 0.75,
  "house plant": 0.85,
  "house": 0.8,
  "hurricane": 0.6,
  "ice cream": 1,
  "jacket": 0.85,
  "jail": 0.95,
  "kangaroo": 0.9,
  "key": 0.85,
  "keyboard": 0.6,
  "knee": 0.85,
  "knife": 0.65,
  "ladder": 1,
  "lantern": 0.6,
  "laptop": 0.85,
  "leaf": 0.85,
  "leg": 0.4,
  "light bulb": 0.85,
  "lighter": 0.85,
  "lighthouse": 0.7,
  "lightning": 0.8,
  "line": 0.85,
  "lion": 0.7,
  "lipstick": 0.85,
  "lobster": 0.65,
  "lollipop": 0.9,
  "mailbox": 0.65,
  "map": 0.75,
  "marker": 0.5,
  "matches": 0.7,
  "megaphone": 0.8,
  "mermaid": 0.95,
  "microphone": 0.65,
  "microwave": 0.75,
  "monkey": 0.7,
  "moon": 0.35,
  "mosquito": 0.5,
  "motorbike": 0.7,
  "mountain": 0.85,
  "mouse": 0.5,
  "moustache": 0.65,
  "mouth": 0.75,
  "mug": 0.75,
  "mushroom": 0.85,
  "nail": 0.55,
  "necklace": 0.85,
  "nose": 0.9,
  "ocean": 0.8,
  "octagon": 0.85,
  "octopus": 0.9,
  "onion": 0.7,
  "oven": 0.35,
  "owl": 0.8,
  "paint can": 0.75,
  "paintbrush": 0.7,
  "palm tree": 0.9,
  "panda": 0.65,
  "pants": 0.75,
  "paper clip": 0.75,
  "parachute": 0.85,
  "parrot": 0.6,
  "passport": 0.7,
  "peanut": 0.8,
  "pear": 0.8,
  "peas": 0.65,
  "pencil": 0.5,
  "penguin": 0.75,
  "piano": 0.65,
  "pickup truck": 0.45,
  "picture frame": 0.95,
  "pig": 0.8,
  "pillow": 0.6,
  "pineapple": 0.8,
  "pizza": 0.7,
  "pliers": 0.5,
  "police car": 0.4,
  "pond": 0.55,
  "pool": 0.45,
  "popsicle": 0.9,
  "postcard": 0.5,
  "potato": 0.75,
  "power outlet": 0.75,
  "purse": 0.75,
  "rabbit": 0.85,
  "raccoon": 0.4,
  "radio": 0.65,
  "rain": 0.9,
  "rainbow": 0.9,
  "rake": 0.75,
  "remote control": 0.8,
  "rhinoceros": 0.7,
  "rifle": 0.8,
  "river": 0.35,
  "roller coaster": 0.8,
  "rollerskates": 0.75,
  "sailboat": 0.9,
  "sandwich": 0.75,
  "saw": 0.75,
  "saxophone": 0.85,
  "school bus": 0.35,
  "scissors": 0.75,
  "scorpion": 0.9,
  "screwdriver": 0.75,
  "sea turtle": 0.9,
  "see saw": 0.85,
  "shark": 0.7,
  "sheep": 0.95,
  "shoe": 0.9,
  "shorts": 0.9,
  "shovel": 0.7,
  "sink": 1,
  "skateboard": 0.8,
  "skull": 0.75,
  "skyscraper": 0.8,
  "sleeping bag": 0.65,
  "smiley face": 0.8,
  "snail": 1,
  "snake": 0.7,
  "snorkel": 0.65,
  "snowflake": 0.9,
  "snowman": 0.9,
  "soccer ball": 0.85,
  "sock": 0.85,
  "speedboat": 0.7,
  "spider": 0.7,
  "spoon": 0.95,
  "spreadsheet": 0.45,
  "square": 0.9,
  "squiggle": 0.45,
  "squirrel": 0.75,
  "stairs": 0.85,
  "star": 1,
  "steak": 0.5,
  "stereo": 0.5,
  "stethoscope": 0.7,
  "stitches": 0.8,
  "stop sign": 0.8,
  "stove": 0.8,
  "strawberry": 0.75,
  "streetlight": 0.65,
  "string bean": 0.4,
  "submarine": 0.85,
  "suitcase": 0.6,
  "sun": 0.85,
  "swan": 0.7,
  "sweater": 0.7,
  "swing set": 0.95,
  "sword": 0.75,
  "syringe": 0.9,
  "t-shirt": 1,
  "table": 0.85,
  "teapot": 0.85,
  "teddy-bear": 0.85,
  "telephone": 0.6,
  "television": 0.9,
  "tennis racquet": 0.95,
  "tent": 0.8,
  "The Eiffel Tower": 0.95,
  "The Great Wall of China": 0.45,
  "The Mona Lisa": 0.95,
  "tiger": 0.45,
  "toaster": 0.7,
  "toe": 0.7,
  "toilet": 0.85,
  "tooth": 0.8,
  "toothbrush": 0.8,
  "toothpaste": 0.65,
  "tornado": 0.75,
  "tractor": 0.85,
  "traffic light": 0.8,
  "train": 0.75,
  "tree": 0.85,
  "triangle": 0.8,
  "trombone": 0.55,
  "truck": 0.35,
  "trumpet": 0.6,
  "umbrella": 0.95,
  "underwear": 0.7,
  "van": 0.5,
  "vase": 0.75,
  "violin": 0.65,
  "washing machine": 1,
  "watermelon": 0.65,
  "waterslide": 0.85,
  "whale": 0.75,
  "wheel": 0.75,
  "windmill": 0.65,
  "wine bottle": 0.9,
  "wine glass": 0.95,
  "wristwatch": 0.9,
  "yoga": 0.6,
  "zebra": 0.75,
  "zigzag": 0.75
};

/**
 * Với mỗi từ khoá: những nhãn mà model hay đoán NHẦM THÀNH (đo được, chỉ gồm cặp
 * xuất hiện ≥ 2/20 mẫu).
 *
 * Dùng để tha thứ cho các cặp lẫn nhau thật sự: người chơi vẽ "con cá" mà model
 * gọi "cá mập" thì không nên bị tính là sai. Đây là danh sách ĐO ĐƯỢC, không
 * phải đoán — và nó chỉ chứa những lẫn nhau đủ phổ biến.
 */
export const CONFUSIONS: Readonly<Record<string, readonly string[]>> = {
  "ambulance": [
    "police car",
    "firetruck"
  ],
  "animal migration": [
    "garden",
    "ocean"
  ],
  "apple": [
    "pear"
  ],
  "axe": [
    "hammer"
  ],
  "barn": [
    "house"
  ],
  "baseball bat": [
    "spoon"
  ],
  "basket": [
    "purse"
  ],
  "bathtub": [
    "hot tub"
  ],
  "bicycle": [
    "motorbike"
  ],
  "book": [
    "passport"
  ],
  "bottlecap": [
    "hockey puck"
  ],
  "brain": [
    "camouflage"
  ],
  "bridge": [
    "The Great Wall of China"
  ],
  "broccoli": [
    "tree"
  ],
  "broom": [
    "rake"
  ],
  "bucket": [
    "paint can",
    "purse"
  ],
  "cake": [
    "birthday cake"
  ],
  "calculator": [
    "passport"
  ],
  "camera": [
    "washing machine"
  ],
  "cat": [
    "pig"
  ],
  "cell phone": [
    "picture frame"
  ],
  "clock": [
    "compass"
  ],
  "cloud": [
    "bush"
  ],
  "computer": [
    "laptop"
  ],
  "cow": [
    "horse"
  ],
  "crown": [
    "grass"
  ],
  "dishwasher": [
    "washing machine"
  ],
  "dresser": [
    "calendar"
  ],
  "duck": [
    "bird"
  ],
  "dumbbell": [
    "eyeglasses"
  ],
  "elbow": [
    "arm"
  ],
  "eye": [
    "hurricane"
  ],
  "face": [
    "smiley face"
  ],
  "feather": [
    "leaf"
  ],
  "fence": [
    "The Great Wall of China"
  ],
  "finger": [
    "hand"
  ],
  "fire hydrant": [
    "lantern",
    "house plant"
  ],
  "fish": [
    "whale"
  ],
  "flamingo": [
    "bird"
  ],
  "golf club": [
    "sock"
  ],
  "guitar": [
    "cello",
    "violin"
  ],
  "horse": [
    "cow"
  ],
  "hospital": [
    "cooler"
  ],
  "hot air balloon": [
    "necklace"
  ],
  "hot dog": [
    "pool"
  ],
  "hot tub": [
    "bathtub"
  ],
  "house": [
    "barn"
  ],
  "jacket": [
    "sweater"
  ],
  "knee": [
    "leg"
  ],
  "knife": [
    "sword"
  ],
  "laptop": [
    "dishwasher"
  ],
  "light bulb": [
    "hot air balloon"
  ],
  "lightning": [
    "zigzag"
  ],
  "lobster": [
    "crab"
  ],
  "map": [
    "camouflage"
  ],
  "matches": [
    "asparagus",
    "streetlight"
  ],
  "megaphone": [
    "axe"
  ],
  "microphone": [
    "tennis racquet"
  ],
  "microwave": [
    "oven"
  ],
  "monkey": [
    "lobster"
  ],
  "motorbike": [
    "bicycle"
  ],
  "moustache": [
    "roller coaster"
  ],
  "mouth": [
    "goatee"
  ],
  "mug": [
    "cup",
    "coffee cup"
  ],
  "necklace": [
    "circle"
  ],
  "paint can": [
    "cup"
  ],
  "panda": [
    "teddy-bear",
    "sea turtle"
  ],
  "pants": [
    "shorts"
  ],
  "parachute": [
    "diamond"
  ],
  "peanut": [
    "potato"
  ],
  "piano": [
    "keyboard"
  ],
  "pizza": [
    "wheel"
  ],
  "potato": [
    "cookie"
  ],
  "purse": [
    "bucket"
  ],
  "radio": [
    "stereo"
  ],
  "rake": [
    "broom"
  ],
  "remote control": [
    "calendar"
  ],
  "rhinoceros": [
    "sea turtle"
  ],
  "shark": [
    "fish"
  ],
  "shorts": [
    "pants"
  ],
  "skyscraper": [
    "marker"
  ],
  "smiley face": [
    "face"
  ],
  "snake": [
    "garden hose",
    "waterslide"
  ],
  "snowflake": [
    "windmill"
  ],
  "soccer ball": [
    "fan"
  ],
  "speedboat": [
    "river"
  ],
  "square": [
    "pillow"
  ],
  "squirrel": [
    "grapes"
  ],
  "stop sign": [
    "lollipop"
  ],
  "strawberry": [
    "pineapple",
    "potato"
  ],
  "streetlight": [
    "matches"
  ],
  "sweater": [
    "jacket"
  ],
  "sword": [
    "knife"
  ],
  "toe": [
    "foot"
  ],
  "toothpaste": [
    "marker"
  ],
  "tornado": [
    "hurricane"
  ],
  "tree": [
    "broccoli"
  ],
  "triangle": [
    "tent"
  ],
  "underwear": [
    "shorts"
  ],
  "violin": [
    "cello"
  ],
  "watermelon": [
    "banana"
  ],
  "whale": [
    "fish",
    "dolphin"
  ],
  "zebra": [
    "tiger"
  ],
  "zigzag": [
    "lightning",
    "grass"
  ]
};
