import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, FileText, Download, Sparkles, ArrowRight } from "lucide-react";
import GameInfoSection from "@/components/GameInfoSection";

const steps = [
  { icon: FileText, title: "ارفع الملفات", desc: "ارفع ملف اللغة (.zs) وملف القاموس" },
  { icon: Shield, title: "معالجة تلقائية", desc: "فك الضغط واستخراج النصوص ومعالجتها" },
  { icon: Download, title: "حمّل النتيجة", desc: "حمّل الملف المعرّب جاهزاً للعبة" },
];

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Back to game select */}
      <div className="absolute top-4 right-4 z-20">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
            كل الألعاب
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      {/* Hero */}
      <header className="relative flex flex-col items-center justify-center min-h-[70vh] px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-display font-semibold">أداة تعريب تلقائية</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black mb-6 leading-tight">
            عرّب لعبة{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-secondary to-primary">
              زيلدا
            </span>{" "}
            بسهولة
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-lg mx-auto font-body">
            ارفع ملفات اللعبة واحصل على نسخة معرّبة بالكامل مع ربط الحروف وعكس الاتجاه تلقائياً
          </p>
          <Link to="/zelda/process">
            <Button size="lg" className="font-display font-bold text-lg px-10 py-6 bg-primary hover:bg-primary/90">
              ابدأ التعريب 🎮
            </Button>
          </Link>
        </div>
      </header>

      {/* Steps */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-12">
            كيف تعمل الأداة؟
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex flex-col items-center text-center p-6 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors"
              >
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <step.icon className="w-7 h-7 text-primary" />
                </div>
                <div className="text-sm text-secondary font-display font-bold mb-1">
                  الخطوة {i + 1}
                </div>
                <h3 className="text-xl font-display font-bold mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Game Info */}
      <GameInfoSection
        accentColor="hsl(142, 70%, 45%)"
        secondaryColor="hsl(47, 100%, 50%)"
        fileFormat=".msbt (مضغوط بـ Zstandard → .zs)"
        fileFormatDesc="ملفات MSBT (Message Studio Binary Text) هي صيغة نينتندو لتخزين النصوص في الألعاب. في زيلدا TotK تكون مضغوطة بصيغة Zstandard."
        requiredFiles={[
          { name: "Msg_USen.Product.sarc.zs", desc: "أرشيف النصوص الإنجليزية الرئيسي — يحتوي جميع ملفات MSBT مضغوطة" },
          { name: "ملف القاموس (glossary.txt)", desc: "قاموس المصطلحات العربية لترجمة أسماء الشخصيات والأماكن والأسلحة" },
        ]}
        tools={[
          { name: "Zstandard (zstd)", desc: "لفك ضغط ملفات .zs واستخراج أرشيف SARC" },
          { name: "MSBT Editor / MsbtLib", desc: "لقراءة وتعديل ملفات MSBT الثنائية" },
          { name: "SARC Tool", desc: "لاستخراج وإعادة حزم أرشيفات SARC" },
        ]}
        method="يتم استخراج ملفات MSBT من أرشيف SARC المضغوط بـ Zstandard. كل ملف MSBT يحتوي على مفاتيح نصية وقيمها. تقوم الأداة بفك الضغط، استخراج النصوص، تطبيق القاموس العربي، عكس اتجاه النص للعربية (RTL)، ربط الحروف العربية (Arabic shaping)، ثم إعادة حزم الملفات."
        notes="يجب استخراج ملفات romFS من اللعبة باستخدام سويتش معدّل أو محاكي. الملفات المعدّلة توضع في مجلد atmosphere/contents على بطاقة SD."
      />

      {/* Footer */}
      <footer className="mt-auto py-6 text-center text-sm text-muted-foreground border-t border-border">
        أداة تعريب زيلدا — مشروع مفتوح المصدر 🇸🇦
      </footer>
    </div>
  );
};

export default Index;
