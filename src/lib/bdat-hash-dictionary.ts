/**
 * BDAT Hash Dictionary for Xenoblade Chronicles 3
 * 
 * Provides Murmur3 hash computation and a dictionary of known
 * table/column names used in XC3 BDAT files.
 */

// ============= Murmur3 32-bit Hash =============

/**
 * Compute Murmur3 32-bit hash of a string.
 * XC3 uses seed=0 for BDAT label hashing.
 */
export function murmur3_32(key: string, seed: number = 0): number {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const len = data.length;
  const nblocks = Math.floor(len / 4);

  let h1 = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  // Body - process 4-byte blocks
  for (let i = 0; i < nblocks; i++) {
    let k1 = (data[i * 4] | (data[i * 4 + 1] << 8) | (data[i * 4 + 2] << 16) | (data[i * 4 + 3] << 24)) >>> 0;

    k1 = Math.imul(k1, c1) >>> 0;
    k1 = ((k1 << 15) | (k1 >>> 17)) >>> 0;
    k1 = Math.imul(k1, c2) >>> 0;

    h1 = (h1 ^ k1) >>> 0;
    h1 = ((h1 << 13) | (h1 >>> 19)) >>> 0;
    h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;
  }

  // Tail
  const tail = nblocks * 4;
  let k1 = 0;
  switch (len & 3) {
    case 3: k1 ^= data[tail + 2] << 16; // fallthrough
    case 2: k1 ^= data[tail + 1] << 8;  // fallthrough
    case 1:
      k1 ^= data[tail];
      k1 = Math.imul(k1 >>> 0, c1) >>> 0;
      k1 = ((k1 << 15) | (k1 >>> 17)) >>> 0;
      k1 = Math.imul(k1, c2) >>> 0;
      h1 = (h1 ^ k1) >>> 0;
  }

  // Finalization
  h1 = (h1 ^ len) >>> 0;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b) >>> 0;
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35) >>> 0;
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

// ============= Known Names Dictionary =============

/** Known table and column names from XC3 BDAT files */
const KNOWN_NAMES: string[] = [
  // Common column names
  'name', 'Name', 'caption', 'Caption', 'text', 'Text', 'message', 'Message',
  'msg', 'Msg', 'title', 'Title', 'description', 'Description', 'desc', 'Desc',
  'label', 'Label', 'info', 'Info', 'detail', 'Detail', 'summary', 'Summary',
  'comment', 'Comment', 'help', 'Help', 'hint', 'Hint', 'note', 'Note',
  'disp', 'Disp', 'skill', 'Skill',

  // Table prefixes (common XC3 table families)
  'FLD_NpcList', 'FLD_NpcResource', 'FLD_NpcSetting',
  'FLD_MapList', 'FLD_MapInfo', 'FLD_AreaList',
  'FLD_ConditionList', 'FLD_ConditionQuest',
  'FLD_EnemyData', 'FLD_QuestList', 'FLD_QuestTask',
  'FLD_SalvagePoint', 'FLD_LocationList',
  'FLD_FieldLockList', 'FLD_DMGFloor',

  'BTL_Arts_En', 'BTL_Arts_Dr', 'BTL_Arts_Common',
  'BTL_Buff', 'BTL_Class', 'BTL_Skill',
  'BTL_EnArrange', 'BTL_EnList', 'BTL_EnDropItem',
  'BTL_HeroInfo', 'BTL_ChainAttack',
  'BTL_Enhance', 'BTL_Aura', 'BTL_StatusList',

  'MNU_Msg', 'MNU_MsgAlt', 'MNU_Name',
  'MNU_ShopList', 'MNU_ShopNormal', 'MNU_ShopTable',
  'MNU_CampMenu', 'MNU_Option',

  'ITM_Accessory', 'ITM_Collection', 'ITM_CylinderItem',
  'ITM_EventList', 'ITM_Exchange', 'ITM_FavoriteList',
  'ITM_Gem', 'ITM_Info', 'ITM_PcEquip', 'ITM_PcWpn',
  'ITM_Precious', 'ITM_Recipe', 'ITM_SalvageList',

  'RSC_NpcList', 'RSC_PcList', 'RSC_EnList',

  'SYS_GimmickData', 'SYS_MapJump', 'SYS_PcAffinityChart',
  'SYS_PouchItem', 'SYS_PopupMsg',

  'EVT_listBf', 'EVT_listFev', 'EVT_listDlc',

  'CHR_Dr', 'CHR_En', 'CHR_Pc', 'CHR_UroBody',
  'CHR_ClassInfo', 'CHR_EnArrange',

  'QST_List', 'QST_Task', 'QST_TaskCondition',
  'QST_Purpose', 'QST_Step',

  'DLC_MapInfo', 'DLC_QuestList',

  // Common column names in XC3
  'ID', 'id', 'Idx', 'idx',
  'DebugName', 'debug_name', 'debugName',
  'Condition', 'Flag', 'Param',
  'Category', 'Type', 'type',
  'Value', 'value', 'Count', 'count',
  'WpnType', 'AtrType', 'RoleType',
  'Price', 'Rarity', 'Level',
  'HP', 'Atk', 'Def',
  'Msg_Name', 'Msg_Info', 'Msg_Detail', 'Msg_Help',
  'MsgIdName', 'MsgIdInfo', 'MsgIdCaption', 'MsgIdHelp',
  'Resource', 'Model', 'Motion',
  'ScenarioFlag', 'QuestFlag',

  // UI / Menu terms
  'Save', 'Load', 'New Game', 'Continue',
  'Equipment', 'Accessories', 'Skills', 'Arts',
  'Characters', 'Party', 'Gems', 'Collectopaedia',
  'Quests', 'System', 'Options', 'Tutorial',
];

/** Precomputed hash -> name lookup table */
const HASH_TO_NAME = new Map<number, string>();

// Build the lookup table
for (const name of KNOWN_NAMES) {
  const hash = murmur3_32(name);
  HASH_TO_NAME.set(hash, name);
}

/**
 * Try to resolve a Murmur3 hash to a known name.
 * Returns the name if found, otherwise returns hex representation.
 */
export function unhashLabel(hash: number): string {
  return HASH_TO_NAME.get(hash) ?? `<0x${hash.toString(16).padStart(8, '0')}>`;
}

/**
 * Check if a hash corresponds to a known name.
 */
export function isKnownHash(hash: number): boolean {
  return HASH_TO_NAME.has(hash);
}

/**
 * Get all known names in the dictionary.
 */
export function getKnownNames(): string[] {
  return [...KNOWN_NAMES];
}

/**
 * Add custom names to the dictionary (e.g., from user-provided glossary).
 */
export function addCustomNames(names: string[]): void {
  for (const name of names) {
    const hash = murmur3_32(name);
    if (!HASH_TO_NAME.has(hash)) {
      HASH_TO_NAME.set(hash, name);
    }
  }
}
