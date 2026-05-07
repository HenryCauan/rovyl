/**
 * English tokens → Lucide icon names. Lets users type plain English (e.g. "work", "time")
 * and see semantically related icons, not only names that contain that substring.
 */

const WORK_OFFICE = [
  'Briefcase',
  'Laptop',
  'Monitor',
  'Coffee',
  'Factory',
  'Building2',
  'Building',
  'Users',
  'PenLine',
  'FileText',
  'Presentation',
  'Contact',
  'Network',
  'Workflow',
  'LayoutGrid',
  'Layers',
  'LayoutDashboard',
  'Armchair',
  'Printer',
  'FolderKanban',
  'Kanban',
  'FileStack',
  'Hammer',
  'Cog',
  'Wrench',
  'Sparkles',
  'Badge',
] as const;

const TIME = [
  'Clock',
  'Timer',
  'AlarmClock',
  'Calendar',
  'Hourglass',
  'Watch',
  'History',
] as const;

const HOME = ['Home', 'Armchair', 'LampDesk', 'Sofa'] as const;

const MEDIA = [
  'Music',
  'Headphones',
  'Mic',
  'Radio',
  'Disc',
  'Volume2',
  'Speaker',
] as const;

const VIDEO = ['Video', 'Film', 'Clapperboard', 'Videotape', 'Webcam', 'Camera'] as const;

const PHOTO = ['Image', 'Camera', 'Aperture', 'ImageIcon', 'ScanLine'] as const;

const MAIL = ['Mail', 'Inbox', 'Send', 'Mails', 'Forward'] as const;

const CHAT = ['MessageSquare', 'MessagesSquare', 'MessageCircle'] as const;

const PHONE = ['Phone', 'Smartphone', 'PhoneCall', 'PhoneForwarded'] as const;

const NETWORK = [
  'Wifi',
  'Globe',
  'Cloud',
  'Server',
  'Database',
  'Router',
  'Network',
] as const;

const SECURITY = [
  'Shield',
  'Lock',
  'Key',
  'Fingerprint',
  'Eye',
  'EyeOff',
  'ShieldCheck',
  'Unlock',
] as const;

const TRAVEL = [
  'Plane',
  'Car',
  'Train',
  'Bus',
  'Ship',
  'Sailboat',
  'Map',
  'MapPin',
  'Navigation',
  'Compass',
  'Luggage',
] as const;

const MONEY = [
  'DollarSign',
  'Wallet',
  'CreditCard',
  'Banknote',
  'PiggyBank',
  'Coins',
  'CircleDollarSign',
] as const;

const SETTINGS = [
  'Settings',
  'SlidersHorizontal',
  'Wrench',
  'Cog',
  'Hammer',
] as const;

const USER = ['User', 'Users', 'UserCircle', 'UserPlus', 'Contact'] as const;

const CODE = [
  'Code',
  'Terminal',
  'Brackets',
  'FileCode',
  'Binary',
  'SquareCode',
  'Github',
  'GitBranch',
  'GitCommit',
  'GitMerge',
] as const;

const GAME = ['Gamepad2', 'Joystick', 'Trophy', 'Medal', 'Puzzle'] as const;

const BOOK = ['Book', 'BookOpen', 'Library', 'GraduationCap', 'School', 'ScrollText'] as const;

const HEALTH = [
  'Stethoscope',
  'Cross',
  'Pill',
  'HeartPulse',
  'Activity',
  'Microscope',
  'Brain',
] as const;

const FOOD = ['Utensils', 'Apple', 'Coffee', 'Wine', 'Pizza', 'Cake', 'Beef'] as const;

const WEATHER = ['Sun', 'Moon', 'CloudRain', 'Snowflake', 'Cloud', 'Wind', 'Droplet'] as const;

const CHART = [
  'BarChart3',
  'LineChart',
  'PieChart',
  'Activity',
  'TrendingUp',
  'Target',
] as const;

const EDIT = ['Pencil', 'PenLine', 'Edit', 'Edit3', 'Highlighter'] as const;

const FILE = ['Folder', 'FolderOpen', 'FileText', 'Archive', 'FileStack', 'Files'] as const;

/** Lowercase English keyword → icon names (must exist in lucide-react). */
export const ENGLISH_KEYWORD_TO_ICONS: Readonly<Record<string, readonly string[]>> = {
  work: [...WORK_OFFICE],
  job: ['Briefcase', 'Laptop', 'Badge', 'Contact', 'Users'],
  office: [...WORK_OFFICE],
  workspace: ['LayoutGrid', 'Layers', 'LayoutDashboard', 'Component', 'Blocks', 'Box', 'PanelTop'],
  business: ['Briefcase', 'Building2', 'Users', 'TrendingUp', 'Presentation'],
  meeting: ['Users', 'Presentation', 'Video', 'Mic', 'Calendar'],
  project: ['FolderKanban', 'Kanban', 'GitBranch', 'Target', 'ClipboardList'],
  team: ['Users', 'UserPlus', 'Contact'],
  company: ['Building2', 'Factory', 'Landmark', 'Store'],
  career: ['Briefcase', 'GraduationCap', 'TrendingUp'],

  time: [...TIME],
  clock: [...TIME],
  schedule: ['Calendar', 'Clock', 'CalendarClock'],
  calendar: ['Calendar', 'CalendarDays', 'CalendarRange'],
  alarm: ['AlarmClock', 'Bell'],
  timer: ['Timer', 'Hourglass', 'Clock'],
  watch: ['Watch', 'Clock'],

  home: [...HOME],
  house: [...HOME],
  living: ['Sofa', 'LampDesk', 'Armchair', 'Home'],

  music: [...MEDIA],
  audio: [...MEDIA],
  sound: [...MEDIA],
  song: ['Music', 'Disc', 'Mic'],

  video: [...VIDEO],
  film: [...VIDEO],
  movie: [...VIDEO],
  camera: [...VIDEO, ...PHOTO],

  photo: [...PHOTO],
  picture: [...PHOTO],
  image: [...PHOTO],

  mail: [...MAIL],
  email: [...MAIL],
  message: [...MAIL, ...CHAT],
  chat: [...CHAT],
  talk: ['Mic', 'MessageSquare', 'PhoneCall'],

  phone: [...PHONE],
  call: [...PHONE],
  mobile: ['Smartphone', 'Tablet'],

  network: [...NETWORK],
  wifi: ['Wifi', 'WifiOff'],
  internet: ['Globe', 'Wifi', 'Cloud'],
  cloud: ['Cloud', 'Upload', 'Download'],

  security: [...SECURITY],
  lock: ['Lock', 'LockKeyhole'],
  safe: ['Shield', 'Lock'],
  password: ['KeyRound', 'Fingerprint', 'Lock'],
  shield: ['Shield', 'ShieldAlert', 'ShieldCheck'],

  travel: [...TRAVEL],
  plane: ['Plane', 'PlaneTakeoff', 'PlaneLanding'],
  trip: ['Luggage', 'Map', 'Plane'],
  map: ['Map', 'MapPinned', 'MapPin'],
  navigation: ['Navigation', 'Compass', 'MapPin'],

  money: [...MONEY],
  pay: ['CreditCard', 'Wallet', 'Banknote'],
  card: ['CreditCard', 'Badge'],
  bank: ['Landmark', 'Banknote', 'PiggyBank'],
  finance: ['TrendingUp', 'LineChart', 'DollarSign'],
  dollar: ['DollarSign', 'CircleDollarSign'],

  settings: [...SETTINGS],
  config: [...SETTINGS],
  tool: ['Wrench', 'Hammer', 'Cog', 'Nut'],
  repair: ['Wrench', 'Hammer', 'Cog'],

  user: [...USER],
  people: [...USER],
  person: ['User', 'UserCircle'],
  account: ['User', 'Badge', 'Contact'],

  code: [...CODE],
  dev: [...CODE],
  terminal: ['Terminal', 'SquareCode'],
  program: ['Code', 'Binary', 'Brackets'],
  git: ['Github', 'GitBranch', 'GitCommit', 'GitMerge', 'GitPullRequest'],

  game: [...GAME],
  play: ['Play', 'PlayCircle', 'Gamepad2'],
  fun: ['Smile', 'PartyPopper', 'Gamepad2'],

  book: [...BOOK],
  read: ['BookOpen', 'BookMarked', 'Glasses'],
  study: ['GraduationCap', 'ScrollText', 'Book'],
  school: ['School', 'GraduationCap', 'Library'],
  learn: ['GraduationCap', 'BookOpen', 'Lightbulb'],

  health: [...HEALTH],
  medical: [...HEALTH],
  doctor: ['Stethoscope', 'Cross', 'Pill'],
  hospital: ['Cross', 'Stethoscope', 'HeartPulse'],

  food: [...FOOD],
  eat: ['Utensils', 'Apple', 'Soup'],
  drink: ['Coffee', 'Wine', 'GlassWater'],

  weather: [...WEATHER],
  sun: ['Sun', 'Sunrise', 'Sunset'],
  rain: ['CloudRain', 'CloudDrizzle', 'Umbrella'],
  snow: ['Snowflake', 'CloudSnow'],

  heart: ['Heart', 'HeartHandshake', 'HeartPulse'],
  love: ['Heart', 'HeartPulse'],
  star: ['Star', 'Sparkles', 'Trophy'],
  favorite: ['Star', 'Bookmark'],

  folder: [...FILE],
  file: [...FILE],
  document: ['FileText', 'File', 'ScrollText'],

  search: ['Search', 'Scan', 'ScanSearch'],
  find: ['Search', 'Radar'],

  download: ['Download', 'DownloadCloud'],
  upload: ['Upload', 'UploadCloud'],

  delete: ['Trash2', 'Trash'],
  trash: ['Trash2', 'Trash'],
  remove: ['X', 'Minus', 'Trash2'],

  edit: [...EDIT],
  write: ['Pencil', 'PenLine', 'FileEdit'],
  draw: ['Pencil', 'PenTool', 'Highlighter'],

  add: ['Plus', 'PlusCircle'],
  plus: ['Plus', 'PlusCircle'],
  new: ['Sparkles', 'Plus', 'FilePlus'],

  check: ['Check', 'CheckCircle', 'CheckCircle2'],
  ok: ['Check', 'ThumbsUp'],
  done: ['CheckCircle', 'CheckCircle2'],

  alert: ['AlertTriangle', 'AlertCircle', 'AlertOctagon'],
  warning: ['AlertTriangle', 'Siren'],
  error: ['XCircle', 'Ban', 'XOctagon'],
  info: ['Info', 'BadgeInfo'],

  arrow: ['ArrowRight', 'ArrowLeft', 'MoveRight', 'Move'],
  direction: ['Navigation', 'Compass', 'Signpost'],

  bell: ['Bell', 'BellRing'],
  notification: ['Bell', 'BellRing', 'Inbox'],

  light: ['Lightbulb', 'Sun', 'Flashlight'],
  dark: ['Moon', 'MoonStar'],
  brightness: ['Sun', 'SunMedium', 'Contrast'],

  moon: ['Moon', 'MoonStar'],
  night: ['Moon', 'Bed'],

  tree: ['TreePine', 'Trees', 'Leaf'],
  nature: ['Leaf', 'Flower', 'Mountain'],
  plant: ['Sprout', 'Leaf', 'Flower2'],

  animal: ['Dog', 'Cat', 'Bird', 'Bug'],
  dog: ['Dog'],
  cat: ['Cat'],

  sport: ['Dumbbell', 'Trophy', 'Medal'],
  gym: ['Dumbbell', 'Activity', 'HeartPulse'],
  fitness: ['Activity', 'Dumbbell', 'Bike'],

  car: ['Car', 'CarFront', 'Fuel'],
  drive: ['Car', 'Navigation', 'MapPin'],
  transport: ['Bus', 'Train', 'Truck', 'Car'],

  boat: ['Ship', 'Sailboat', 'Anchor'],
  ship: ['Ship', 'Anchor', 'Sailboat'],

  train: ['Train', 'TrainFront', 'TramFront'],
  bus: ['Bus', 'BusFront'],

  chart: [...CHART],
  graph: [...CHART],
  data: ['Database', 'Table', 'BarChart3'],
  analytics: ['LineChart', 'TrendingUp', 'Activity'],

  color: ['Palette', 'Paintbrush', 'Pipette'],
  paint: ['Paintbrush', 'PaintBucket', 'Palette'],
  art: ['Palette', 'Brush', 'Image'],

  location: ['MapPin', 'MapPinned', 'LocateFixed'],
  pin: ['MapPin', 'Pin'],
  gps: ['LocateFixed', 'Navigation', 'MapPin'],

  globe: ['Globe', 'Globe2'],
  world: ['Globe', 'Globe2', 'Map'],

  database: ['Database', 'Server', 'HardDrive'],
  sql: ['Database', 'Table', 'Binary'],

  social: ['Share2', 'Users', 'Heart'],
  share: ['Share2', 'Forward', 'Send'],

  shopping: ['ShoppingCart', 'ShoppingBag', 'Store'],
  cart: ['ShoppingCart', 'ShoppingBasket'],
  store: ['Store', 'ShoppingBag', 'Building2'],

  keyboard: ['Keyboard', 'Command'],
  mouse: ['Mouse', 'MousePointer2'],
  screen: ['Monitor', 'Laptop', 'Tv'],
  computer: ['Laptop', 'Monitor', 'Cpu'],
  laptop: ['Laptop', 'Monitor'],
  monitor: ['Monitor', 'ScreenShare'],

  fire: ['Flame', 'Zap'],
  water: ['Droplet', 'Waves', 'GlassWater'],
  energy: ['Zap', 'Battery', 'Plug'],

  bug: ['Bug', 'BugOff'],
  idea: ['Lightbulb', 'Sparkles', 'Brain'],
  magic: ['Wand2', 'Sparkles', 'Stars'],
  rocket: ['Rocket', 'Zap'],
  crown: ['Crown', 'Award'],
  gift: ['Gift', 'Package'],
  award: ['Award', 'Medal', 'Trophy'],
};

function uniqIcons(names: readonly string[]): string[] {
  return [...new Set(names)];
}

/** Normalize keyword map: drop unknown names at load time (dev safety). */
export function buildResolvedEnglishKeywordMap(validNames: Set<string>): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [kw, icons] of Object.entries(ENGLISH_KEYWORD_TO_ICONS)) {
    const ok = uniqIcons(icons.filter((n) => validNames.has(n)));
    if (ok.length) m.set(kw.toLowerCase(), ok);
  }
  return m;
}

/**
 * Match user token against a keyword entry (all lowercase).
 * - 1 char: no keyword expansion (avoid noise).
 * - 2 chars: prefix match on keyword.
 * - 3+: prefix or substring on keyword.
 */
export function keywordMatchesSearchTerm(keyword: string, token: string): boolean {
  const k = keyword.toLowerCase();
  const t = token.toLowerCase();
  if (!t || !k) return false;
  if (k === t) return true;
  const len = t.length;
  if (len === 1) return false;
  if (len === 2) return k.startsWith(t);
  return k.startsWith(t) || k.includes(t);
}

export function collectIconsForEnglishTokens(
  tokens: string[],
  resolvedMap: Map<string, string[]>
): Set<string> {
  const out = new Set<string>();
  for (const raw of tokens) {
    const token = raw.toLowerCase().trim();
    if (!token) continue;
    for (const [kw, icons] of resolvedMap) {
      if (keywordMatchesSearchTerm(kw, token)) {
        for (const icon of icons) out.add(icon);
      }
    }
  }
  return out;
}
