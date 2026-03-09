import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, MapPin, Swords, Gamepad2, MessageSquare, Layers, Bug, Sparkles, Search, Filter, X, Copy, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface GlossaryCategoryFilterProps {
  glossaryText: string;
  onCopyFiltered: (text: string) => void;
}

type CategoryKey = "characters" | "locations" | "items" | "classes" | "monsters" | "combat" | "skills" | "ui" | "dialogue" | "other";

interface CategoryConfig {
  key: CategoryKey;
  label: string;
  icon: React.ReactNode;
  color: string;
  patterns: RegExp[];
}

const CATEGORIES: CategoryConfig[] = [
  { 
    key: "characters", 
    label: "شخصيات", 
    icon: <Users className="w-3.5 h-3.5" />, 
    color: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    patterns: [/^(mr\.|ms\.|dr\.|captain|king|queen|lord|lady|chief|elder|colonel|general)\s/i, /^[A-Z][a-z]+$/]
  },
  { 
    key: "locations", 
    label: "مواقع", 
    icon: <MapPin className="w-3.5 h-3.5" />, 
    color: "bg-green-500/10 text-green-500 border-green-500/30",
    patterns: [/\b(cave|lake|mountain|village|city|tower|bridge|camp|colony|region|area|cliff|forest|sea|ocean|island|plain|valley|ruins|temple|shrine|road|path|gate|port|hill|spring|falls|cemetery|grave|aetia|swordmarch|maktha|pentelas|cadensia|keves|castle|fornis|erythia|yzana|origin)\b/i]
  },
  { 
    key: "items", 
    label: "عناصر ومعدات", 
    icon: <Swords className="w-3.5 h-3.5" />, 
    color: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    patterns: [/\b(sword|blade|shield|armor|weapon|gem|accessory|ring|core|crystal|chip|pouch|item|material|ingredient|collectible|cylinder|recipe|dish|food|helmet|gauntlet|greaves|boots)\b/i]
  },
  { 
    key: "classes", 
    label: "كلاسات وأدوار", 
    icon: <Gamepad2 className="w-3.5 h-3.5" />, 
    color: "bg-orange-500/10 text-orange-500 border-orange-500/30",
    patterns: [/\b(war medic|soulhacker|flash fencer|zephyr|stalker|strategos|signifer|medic gunner|incursor|full metal jaguar|machine assassin|royal summoner|yumsmith|guardian commander|lone exile|lost vanguard|lifesage|noblesse|troubadour|seraph|martial artist|thaumaturge|swordfighter|ogre|tactician|heavy guard|healer|attacker|defender|tank|class|role)\b/i]
  },
  { 
    key: "monsters", 
    label: "وحوش وأعداء", 
    icon: <Bug className="w-3.5 h-3.5" />, 
    color: "bg-rose-500/10 text-rose-500 border-rose-500/30",
    patterns: [/\b(monster|boss|elite|unique monster|enemy|mob|creature|tirkin|gogol|ardun|levnis|ferron|igna|cephalopod|antol|volff|kromar|urchon|eks|fog beast|fog king|moebius|consul|flame clock|annihilator|superboss|lucky|bounty|rare monster|guardian|armu)\b/i]
  },
  { 
    key: "combat", 
    label: "قتال وهجمات", 
    icon: <Swords className="w-3.5 h-3.5" />, 
    color: "bg-red-500/10 text-red-500 border-red-500/30",
    patterns: [/\b(attack|strike|slash|smash|hit|punch|combo|chain attack|critical|break|topple|daze|launch|burst|aggro|damage|evasion|accuracy|defense|block|interlink|ouroboros|cancel|crit|hp|mp|ap|sp|exp)\b/i]
  },
  { 
    key: "skills", 
    label: "مهارات وتأثيرات", 
    icon: <Sparkles className="w-3.5 h-3.5" />, 
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
    patterns: [/\b(skill|art|talent|master art|buff|debuff|heal|regen|cure|protect|barrier|boost|enhance|strengthen|weaken|poison|burn|bleed|stun|sleep|paralyze|slow|haste|resist|aura|blessing|curse|boon|elemental|ether|physical)\b/i]
  },
  { 
    key: "ui", 
    label: "واجهة وقوائم", 
    icon: <Layers className="w-3.5 h-3.5" />, 
    color: "bg-purple-500/10 text-purple-500 border-purple-500/30",
    patterns: [/\b(menu|button|option|setting|save|load|screen|tab|select|confirm|cancel|back|next|yes|no|ok|tutorial|hint|tip|guide|help|display|toggle|mode|auto|manual|equip|inventory|status|party|quest|map)\b/i]
  },
  { 
    key: "dialogue", 
    label: "حوارات", 
    icon: <MessageSquare className="w-3.5 h-3.5" />, 
    color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/30",
    patterns: [/\.{3}|!{2,}|\?{2,}/]
  },
];

function categorizeEntry(eng: string, arb: string): CategoryKey {
  const engLower = eng.toLowerCase();
  
  for (const cat of CATEGORIES) {
    for (const pattern of cat.patterns) {
      if (pattern.test(engLower) || pattern.test(eng)) {
        return cat.key;
      }
    }
  }
  
  // Special case for dialogue (long text)
  if (eng.length > 40 || eng.includes('...') || eng.includes('!') || eng.includes('?')) {
    return "dialogue";
  }
  
  return "other";
}

interface GlossaryEntry {
  eng: string;
  arb: string;
  category: CategoryKey;
  line: string;
}

const GlossaryCategoryFilter: React.FC<GlossaryCategoryFilterProps> = ({ glossaryText, onCopyFiltered }) => {
  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  const { entries, categoryCounts, conflicts } = useMemo(() => {
    const entries: GlossaryEntry[] = [];
    const categoryCounts: Record<CategoryKey | "other", number> = {
      characters: 0, locations: 0, items: 0, classes: 0, monsters: 0,
      combat: 0, skills: 0, ui: 0, dialogue: 0, other: 0
    };
    
    // Track conflicts: same English term with different Arabic translations
    const termMap = new Map<string, Set<string>>();
    
    if (!glossaryText?.trim()) return { entries, categoryCounts, conflicts: [] };
    
    for (const line of glossaryText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      
      const eng = trimmed.slice(0, eqIdx).trim();
      const arb = trimmed.slice(eqIdx + 1).trim();
      if (!eng || !arb) continue;
      
      const category = categorizeEntry(eng, arb);
      entries.push({ eng, arb, category, line: trimmed });
      categoryCounts[category]++;
      
      // Track for conflicts
      const normKey = eng.toLowerCase();
      if (!termMap.has(normKey)) {
        termMap.set(normKey, new Set());
      }
      termMap.get(normKey)!.add(arb);
    }
    
    // Find conflicts (terms with multiple different translations)
    const conflicts: { term: string; translations: string[] }[] = [];
    for (const [term, translations] of termMap) {
      if (translations.size > 1) {
        conflicts.push({ term, translations: Array.from(translations) });
      }
    }
    
    return { entries, categoryCounts, conflicts };
  }, [glossaryText]);

  const filteredEntries = useMemo(() => {
    let result = entries;
    
    if (activeCategories.size > 0) {
      result = result.filter(e => activeCategories.has(e.category));
    }
    
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      result = result.filter(e => 
        e.eng.toLowerCase().includes(search) || 
        e.arb.includes(search)
      );
    }
    
    return result;
  }, [entries, activeCategories, searchTerm]);

  const toggleCategory = (key: CategoryKey) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setActiveCategories(new Set());
    setSearchTerm("");
  };

  const copyFiltered = () => {
    const text = filteredEntries.map(e => e.line).join('\n');
    onCopyFiltered(text);
    toast({
      title: "تم النسخ",
      description: `تم نسخ ${filteredEntries.length} مصطلح`,
    });
  };

  if (entries.length === 0) return null;

  return (
    <div className="space-y-3 p-3 rounded-lg border border-border bg-card/50">
      {/* Search and controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث في المصطلحات..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-9 h-8 text-sm"
          />
        </div>
        {(activeCategories.size > 0 || searchTerm) && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2">
            <X className="w-4 h-4" />
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={copyFiltered} className="h-8 gap-1">
          <Copy className="w-3.5 h-3.5" />
          <span className="text-xs">{filteredEntries.length}</span>
        </Button>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => toggleCategory(cat.key)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs transition-all ${
              activeCategories.has(cat.key) 
                ? cat.color + ' border-current' 
                : 'bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50'
            }`}
          >
            {cat.icon}
            <span>{cat.label}</span>
            <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">
              {categoryCounts[cat.key]}
            </Badge>
          </button>
        ))}
        {categoryCounts.other > 0 && (
          <button
            onClick={() => toggleCategory("other")}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs transition-all ${
              activeCategories.has("other") 
                ? 'bg-muted text-foreground border-border' 
                : 'bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>أخرى</span>
            <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">
              {categoryCounts.other}
            </Badge>
          </button>
        )}
      </div>

      {/* Conflicts warning */}
      {conflicts.length > 0 && (
        <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2 text-amber-500 text-xs font-bold mb-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>⚠️ {conflicts.length} تعارض في الترجمات</span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {conflicts.slice(0, 5).map(c => (
              <div key={c.term} className="text-xs text-muted-foreground">
                <span className="font-mono text-amber-600">{c.term}</span>
                <span className="mx-1">←</span>
                <span>{c.translations.join(' | ')}</span>
              </div>
            ))}
            {conflicts.length > 5 && (
              <div className="text-xs text-muted-foreground">
                ... و {conflicts.length - 5} تعارضات أخرى
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filtered results summary */}
      {(activeCategories.size > 0 || searchTerm) && (
        <div className="text-xs text-muted-foreground">
          يُعرض {filteredEntries.length} من {entries.length} مصطلح
        </div>
      )}
    </div>
  );
};

export default GlossaryCategoryFilter;
