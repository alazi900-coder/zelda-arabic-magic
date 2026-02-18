import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, FileText, Download, Sparkles, ArrowRight } from "lucide-react";
import GameInfoSection from "@/components/GameInfoSection";

const steps = [
  { icon: FileText, title: "ارفع الملفات", desc: "ارفع ملف اللغة وملف القاموس الخاص باللعبة" },
  { icon: Shield, title: "معالجة تلقائية", desc: "استخراج النصوص ومعالجتها وربط الحروف العربية" },
  { icon: Download, title: "حمّل النتيجة", desc: "حمّل الملف المعرّب جاهزاً للعبة" },
];

const Xenoblade = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="absolute top-4 right-4 z-20">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
            كل الألعاب
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      <header className="relative flex flex-col items-center justify-center min-h-[70vh] px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(200,70%,45%)]/10 via-transparent to-transparent" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-[hsl(200,70%,45%)]/10 border border-[hsl(200,70%,45%)]/20">
            <Sparkles className="w-4 h-4 text-[hsl(200,70%,45%)]" />
            <span className="text-sm text-[hsl(200,70%,45%)] font-display font-semibold">أداة تعريب تلقائية</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-black mb-6 leading-tight">
            عرّب لعبة{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-[hsl(180,60%,40%)] to-[hsl(200,70%,45%)]">
              زينوبليد
            </span>{" "}
            بسهولة
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-lg mx-auto font-body">
            ارفع ملفات اللعبة واحصل على نسخة معرّبة بالكامل مع ربط الحروف وعكس الاتجاه تلقائياً
          </p>
          <Button size="lg" disabled className="font-display font-bold text-lg px-10 py-6 opacity-60 cursor-not-allowed">
            قريباً 🔮
          </Button>
        </div>
      </header>

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-center mb-12">كيف تعمل الأداة؟</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center p-6 rounded-xl bg-card border border-border hover:border-[hsl(200,70%,45%)]/40 transition-colors">
                <div className="w-14 h-14 rounded-full bg-[hsl(200,70%,45%)]/10 flex items-center justify-center mb-4">
                  <step.icon className="w-7 h-7 text-[hsl(200,70%,45%)]" />
                </div>
                <div className="text-sm text-[hsl(180,60%,40%)] font-display font-bold mb-1">الخطوة {i + 1}</div>
                <h3 className="text-xl font-display font-bold mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <GameInfoSection
        accentColor="hsl(200, 70%, 45%)"
        secondaryColor="hsl(180, 60%, 40%)"
        fileFormat=".bdat / .msbt"
        fileFormatDesc="Xenoblade Chronicles 3 تستخدم ملفات BDAT لتخزين البيانات الجدولية (أسماء، أوصاف، إحصائيات) وملفات MSBT للحوارات والنصوص السردية."
        requiredFiles={[
          { name: "ملفات BDAT", desc: "تحتوي على أسماء الشخصيات والأسلحة والمهام والأوصاف — موجودة في مجلد bdat داخل romFS" },
          { name: "ملفات MSBT", desc: "تحتوي على الحوارات والنصوص السردية — موجودة في مجلد Message داخل romFS" },
          { name: "ملف القاموس", desc: "قاموس المصطلحات العربية لترجمة الأسماء والمصطلحات الخاصة باللعبة" },
        ]}
        tools={[
          { name: "bdat-rs", desc: "أداة لاستخراج وتعديل ملفات BDAT — تحوّلها إلى JSON/CSV للتعديل" },
          { name: "MSBT Editor", desc: "لقراءة وتعديل ملفات MSBT الثنائية للحوارات" },
          { name: "NX Editor", desc: "لاستخراج وإعادة حزم ملفات romFS" },
        ]}
        method="يتم استخراج ملفات BDAT وتحويلها إلى JSON باستخدام أداة bdat-rs. يتم ترجمة النصوص وتطبيق ربط الحروف العربية وعكس الاتجاه، ثم إعادة تحويلها إلى BDAT. الحوارات في ملفات MSBT تعالَج بنفس طريقة زيلدا."
        notes="Xenoblade 3 تحتوي على كمية ضخمة من النصوص (أكثر من 100,000 سطر). التعريب الكامل يتطلب وقتاً طويلاً. يُنصح بالبدء بالقوائم والأسماء أولاً."
      />

      <footer className="mt-auto py-6 text-center text-sm text-muted-foreground border-t border-border">
        أداة تعريب زينوبليد كرونيكلز 3 — مشروع مفتوح المصدر 🇸🇦
      </footer>
    </div>
  );
};

export default Xenoblade;
