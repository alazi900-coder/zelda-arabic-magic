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

  // Field / Map tables
  'FLD_NpcList', 'FLD_NpcResource', 'FLD_NpcSetting', 'FLD_NpcMobList',
  'FLD_MapList', 'FLD_MapInfo', 'FLD_AreaList', 'FLD_AreaInfo',
  'FLD_ConditionList', 'FLD_ConditionQuest', 'FLD_ConditionFlag',
  'FLD_EnemyData', 'FLD_QuestList', 'FLD_QuestTask', 'FLD_QuestReward',
  'FLD_SalvagePoint', 'FLD_LocationList', 'FLD_LocationResource',
  'FLD_FieldLockList', 'FLD_DMGFloor', 'FLD_FieldSkillList',
  'FLD_ClimbList', 'FLD_JumpList', 'FLD_WarpList',
  'FLD_MobResource', 'FLD_MobList', 'FLD_MobPopList',
  'FLD_EventPop', 'FLD_EventList', 'FLD_EventSetup',
  'FLD_CollectionList', 'FLD_CollectionTable',
  'FLD_Landmark', 'FLD_LandmarkPop', 'FLD_LandmarkResource',
  'FLD_Achievement', 'FLD_AchievementSet',
  'FLD_Colony', 'FLD_ColonyList', 'FLD_ColonyNpc',
  'FLD_Camp', 'FLD_CampList', 'FLD_CampEnv',
  'FLD_UniqueMonster', 'FLD_UniqueList',
  'FLD_GimmickList', 'FLD_GimmickData',
  'FLD_Kizuna', 'FLD_KizunaList',
  'FLD_Weather', 'FLD_WeatherList', 'FLD_WeatherInfo',
  'FLD_TboxList', 'FLD_TboxData',

  // Battle tables
  'BTL_Arts_En', 'BTL_Arts_Dr', 'BTL_Arts_Common', 'BTL_Arts_Pc',
  'BTL_Arts_ClassArt', 'BTL_Arts_MasterArt', 'BTL_Arts_Extra',
  'BTL_Buff', 'BTL_BuffList', 'BTL_BuffParam',
  'BTL_Class', 'BTL_ClassList', 'BTL_ClassParam', 'BTL_ClassSkill',
  'BTL_Skill', 'BTL_SkillList', 'BTL_SkillParam',
  'BTL_EnArrange', 'BTL_EnList', 'BTL_EnDropItem', 'BTL_EnParam',
  'BTL_HeroInfo', 'BTL_HeroSkill', 'BTL_HeroArts',
  'BTL_ChainAttack', 'BTL_ChainParam', 'BTL_ChainOrder',
  'BTL_Enhance', 'BTL_EnhanceList', 'BTL_EnhanceEff',
  'BTL_Aura', 'BTL_AuraList', 'BTL_AuraParam',
  'BTL_StatusList', 'BTL_StatusParam',
  'BTL_Combo', 'BTL_ComboList',
  'BTL_Ouroboros', 'BTL_OuroborosParam', 'BTL_OuroborosSkill',
  'BTL_Interlink', 'BTL_InterlinkLevel',
  'BTL_SpArt', 'BTL_SpArtList',
  'BTL_Talent', 'BTL_TalentList', 'BTL_TalentNode',
  'BTL_WpnType', 'BTL_WpnParam',
  'BTL_Formation', 'BTL_FormationType',
  'BTL_Reaction', 'BTL_ReactionList',

  // Menu tables
  'MNU_Msg', 'MNU_MsgAlt', 'MNU_Name', 'MNU_MsgFix',
  'MNU_ShopList', 'MNU_ShopNormal', 'MNU_ShopTable', 'MNU_ShopExchange',
  'MNU_CampMenu', 'MNU_Option', 'MNU_OptionList',
  'MNU_Tutorial', 'MNU_TutorialList', 'MNU_TutorialMsg',
  'MNU_MapInfo', 'MNU_MapList',
  'MNU_ClassInfo', 'MNU_ClassList',
  'MNU_Collectopaedia', 'MNU_CollectoList',
  'MNU_ItemInfo', 'MNU_GemInfo',
  'MNU_StatusMsg', 'MNU_BattleMsg',
  'MNU_QuestInfo', 'MNU_QuestList',
  'MNU_HeroInfo', 'MNU_HeroList',
  'MNU_Achievement', 'MNU_AchievementMsg',
  'MNU_System', 'MNU_SystemMsg',

  // Item tables
  'ITM_Accessory', 'ITM_AccessoryList', 'ITM_AccessoryParam',
  'ITM_Collection', 'ITM_CollectionList',
  'ITM_CylinderItem', 'ITM_CylinderList',
  'ITM_EventList', 'ITM_Exchange', 'ITM_ExchangeList',
  'ITM_FavoriteList', 'ITM_FavoriteItem',
  'ITM_Gem', 'ITM_GemList', 'ITM_GemParam',
  'ITM_Info', 'ITM_InfoList',
  'ITM_PcEquip', 'ITM_PcWpn', 'ITM_PcWpnList',
  'ITM_Precious', 'ITM_PreciousList',
  'ITM_Recipe', 'ITM_RecipeList', 'ITM_RecipeItem',
  'ITM_SalvageList', 'ITM_SalvageItem',
  'ITM_Category', 'ITM_CategoryList',
  'ITM_Material', 'ITM_MaterialList',
  'ITM_Key', 'ITM_KeyList',
  'ITM_Bonus', 'ITM_BonusList',

  // Resource tables
  'RSC_NpcList', 'RSC_PcList', 'RSC_EnList',
  'RSC_MobList', 'RSC_ObjList', 'RSC_EffList',

  // System tables
  'SYS_GimmickData', 'SYS_MapJump', 'SYS_PcAffinityChart',
  'SYS_PouchItem', 'SYS_PopupMsg', 'SYS_PopupList',
  'SYS_Flag', 'SYS_FlagList', 'SYS_FlagWork',
  'SYS_Difficulty', 'SYS_DifficultyParam',
  'SYS_SavePoint', 'SYS_SaveList',
  'SYS_Sound', 'SYS_SoundList',
  'SYS_Config', 'SYS_ConfigList',
  'SYS_Tips', 'SYS_TipsList',
  'SYS_Loading', 'SYS_LoadingMsg',

  // Event tables
  'EVT_listBf', 'EVT_listFev', 'EVT_listDlc',
  'EVT_listCs', 'EVT_listEv', 'EVT_listTlk',
  'EVT_Talk', 'EVT_TalkList', 'EVT_TalkSetup',
  'EVT_Setup', 'EVT_SetupList',
  'EVT_MovieList', 'EVT_Movie',

  // Character tables
  'CHR_Dr', 'CHR_En', 'CHR_Pc', 'CHR_UroBody',
  'CHR_ClassInfo', 'CHR_EnArrange',
  'CHR_PcList', 'CHR_DrList', 'CHR_EnList',
  'CHR_Ouroboros', 'CHR_OuroborosList',
  'CHR_Hero', 'CHR_HeroList',

  // Quest tables
  'QST_List', 'QST_Task', 'QST_TaskCondition',
  'QST_Purpose', 'QST_Step', 'QST_StepList',
  'QST_Reward', 'QST_RewardList',
  'QST_Talk', 'QST_TalkList',
  'QST_Colony', 'QST_ColonyList',
  'QST_Flag', 'QST_FlagList',
  'QST_Hero', 'QST_HeroList',

  // DLC tables
  'DLC_MapInfo', 'DLC_QuestList',
  'DLC_ItemList', 'DLC_EnemyData',
  'DLC_HeroInfo', 'DLC_ClassList',
  'DLC_Challenge', 'DLC_ChallengeList',
  'DLC_FutureRedeemed', 'DLC_FRList',

  // Ma (message archive) tables
  'MA_Msg', 'MA_MsgList', 'MA_FLD', 'MA_BTL', 'MA_MNU',
  'MA_QST', 'MA_EVT', 'MA_SYS', 'MA_DLC',

  // Gem Crafting
  'GMK_Data', 'GMK_List', 'GMK_Param', 'GMK_Setup',

  // Common column names in XC3
  'ID', 'id', 'Idx', 'idx',
  'DebugName', 'debug_name', 'debugName',
  'Condition', 'Flag', 'Param', 'Result',
  'Category', 'Type', 'type', 'Kind', 'kind',
  'Value', 'value', 'Count', 'count', 'Num', 'num',
  'WpnType', 'AtrType', 'RoleType', 'ArtType',
  'Price', 'Rarity', 'Level', 'Rank',
  'HP', 'Atk', 'Def', 'Agi', 'Dex', 'Luck',
  'Exp', 'Gold', 'SP', 'AP', 'CP', 'TP',
  'Msg_Name', 'Msg_Info', 'Msg_Detail', 'Msg_Help', 'Msg_Caption',
  'MsgIdName', 'MsgIdInfo', 'MsgIdCaption', 'MsgIdHelp', 'MsgIdDetail',
  'Resource', 'Model', 'Motion', 'Effect',
  'ScenarioFlag', 'QuestFlag', 'EventFlag', 'ColonyFlag',
  'Rate', 'Prob', 'Ratio', 'Percent',
  'Min', 'Max', 'Base', 'Add', 'Ratio',
  'Icon', 'IconId', 'Thumbnail',
  'SortId', 'Priority', 'Order',
  'Enable', 'Disable', 'Valid', 'Invalid',
  'Start', 'End', 'Duration', 'Interval',
  'Target', 'Range', 'Distance', 'Radius',
  'Power', 'Scale', 'Factor', 'Bonus',
  'Slot', 'Socket', 'Equip',
  'Color', 'Size', 'Weight',

  // UI / Menu terms
  'Save', 'Load', 'New Game', 'Continue',
  'Equipment', 'Accessories', 'Skills', 'Arts',
  'Characters', 'Party', 'Gems', 'Collectopaedia',
  'Quests', 'System', 'Options', 'Tutorial',
  'Inventory', 'Map', 'Journal', 'Affinity',
  'Colony', 'Ouroboros', 'Interlink', 'Chain Attack',
  'Class Change', 'Gem Crafting', 'Cooking',
  'Rest Spot', 'Landmark', 'Secret Area',
  'Unique Monster', 'Named Enemy',
  'Discussion', 'Heart-to-Heart',
  'Nopon Coin', 'Bonus Exp',
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
