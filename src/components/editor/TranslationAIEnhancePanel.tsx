import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, Check, X, AlertTriangle, BookOpen, Wand2, Languages, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { ExtractedEntry } from "./types";

interface TranslationAIEnhancePanelProps {
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  onApplySuggestion: (key: string, newText: string) => void;
  glossary?: string;
}

interface EnhanceSuggestion {
  key: string;
  original: string;
  current: string;
  suggested: string;
  reason: string;
  type: "style" | "grammar" | "accuracy" | "consistency";
}

interface GrammarIssue {
  key: string;
  original: string;
  translation: string;
  issue: string;
  suggestion: string;
}

const TranslationAIEnhancePanel: React.FC<TranslationAIEnhancePanelProps> = ({
  entries,
  translations,
  onApplySuggestion,
  glossary,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<EnhanceSuggestion[]>([]);
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([]);
  const [activeTab, setActiveTab] = useState<"enhance" | "grammar">("enhance");

  const analyzeTranslations = async (mode: "enhance" | "grammar") => {
    // Get translated entries
    const translatedEntries = entries
      .filter(e => {
        const key = `${e.msbtFile}:${e.index}`;
        return translations[key]?.trim();
      })
      .slice(0, 20); // Limit for performance

    if (translatedEntries.length === 0) {
      toast({ title: "لا توجد ترجمات للتحليل", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    setActiveTab(mode);

    try {
      const textsToAnalyze = translatedEntries.map(e => ({
        key: `${e.msbtFile}:${e.index}`,
        original: e.original,
        translation: translations[`${e.msbtFile}:${e.index}`],
      }));

      const { data, error } = await supabase.functions.invoke('enhance-translations', {
        body: {
          entries: textsToAnalyze,
          mode,
          glossary: glossary?.slice(0, 5000), // Limit glossary size
        },
      });

      if (error) throw error;

      if (mode === "enhance") {
        setSuggestions(data.suggestions || []);
        if (data.suggestions?.length === 0) {
          toast({ title: "✅ الترجمات جيدة", description: "لم يتم العثور على اقتراحات تحسين" });
        }
      } else {
        setGrammarIssues(data.issues || []);
        if (data.issues?.length === 0) {
          toast({ title: "✅ لا توجد أخطاء نحوية", description: "الترجمات سليمة لغوياً" });
        }
      }
    } catch (err) {
      console.error('Analysis error:', err);
      toast({ title: "خطأ في التحليل", description: String(err), variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applySuggestion = (item: EnhanceSuggestion | GrammarIssue) => {
    const newText = 'suggested' in item ? item.suggested : item.suggestion;
    onApplySuggestion(item.key, newText);
    
    if ('suggested' in item) {
      setSuggestions(prev => prev.filter(s => s.key !== item.key));
    } else {
      setGrammarIssues(prev => prev.filter(g => g.key !== item.key));
    }
    
    toast({ title: "✅ تم تطبيق الاقتراح" });
  };

  const dismissSuggestion = (key: string) => {
    setSuggestions(prev => prev.filter(s => s.key !== key));
    setGrammarIssues(prev => prev.filter(g => g.key !== key));
  };

  const typeLabels: Record<string, { label: string; color: string }> = {
    style: { label: "أسلوب", color: "bg-purple-500/10 text-purple-500" },
    grammar: { label: "قواعد", color: "bg-red-500/10 text-red-500" },
    accuracy: { label: "دقة", color: "bg-blue-500/10 text-blue-500" },
    consistency: { label: "اتساق", color: "bg-amber-500/10 text-amber-500" },
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          تحسين الترجمة بالذكاء الاصطناعي
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeTab === "enhance" ? "default" : "outline"}
            size="sm"
            onClick={() => analyzeTranslations("enhance")}
            disabled={isAnalyzing}
            className="gap-1.5"
          >
            {isAnalyzing && activeTab === "enhance" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            تحسين الصياغة
          </Button>
          <Button
            variant={activeTab === "grammar" ? "default" : "outline"}
            size="sm"
            onClick={() => analyzeTranslations("grammar")}
            disabled={isAnalyzing}
            className="gap-1.5"
          >
            {isAnalyzing && activeTab === "grammar" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <BookOpen className="w-4 h-4" />
            )}
            فحص القواعد النحوية
          </Button>
        </div>

        {/* Results */}
        {activeTab === "enhance" && suggestions.length > 0 && (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <div key={i} className="p-3 rounded-lg border bg-card space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={typeLabels[s.type]?.color || ""}>
                          {typeLabels[s.type]?.label || s.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {s.original.slice(0, 40)}...
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.reason}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500" onClick={() => applySuggestion(s)}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => dismissSuggestion(s.key)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-[10px] text-muted-foreground mb-1">الحالي:</p>
                      <p className="text-xs" dir="rtl">{s.current}</p>
                    </div>
                    <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                      <p className="text-[10px] text-green-600 mb-1">المقترح:</p>
                      <p className="text-xs" dir="rtl">{s.suggested}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {activeTab === "grammar" && grammarIssues.length > 0 && (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {grammarIssues.map((g, i) => (
                <div key={i} className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-xs font-bold text-red-500">{g.issue}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{g.original.slice(0, 50)}...</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500" onClick={() => applySuggestion(g)}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => dismissSuggestion(g.key)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 rounded bg-red-500/10">
                      <p className="text-[10px] text-red-500 mb-1">به خطأ:</p>
                      <p className="text-xs" dir="rtl">{g.translation}</p>
                    </div>
                    <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                      <p className="text-[10px] text-green-600 mb-1">التصحيح:</p>
                      <p className="text-xs" dir="rtl">{g.suggestion}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Empty states */}
        {!isAnalyzing && suggestions.length === 0 && grammarIssues.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>اضغط على أحد الأزرار لتحليل الترجمات</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TranslationAIEnhancePanel;
