import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface GameCard {
  id: string;
  name: string;
  nameEn: string;
  emoji: string;
  path: string;
  ready: boolean;
  color: string;
}

const games: GameCard[] = [
  {
    id: "zelda",
    name: "زيلدا: دموع المملكة",
    nameEn: "Zelda: Tears of the Kingdom",
    emoji: "🗡️",
    path: "/zelda",
    ready: true,
    color: "from-primary to-primary/60",
  },
  {
    id: "splatoon",
    name: "سبلاتون 3",
    nameEn: "Splatoon 3",
    emoji: "🦑",
    path: "/splatoon",
    ready: false,
    color: "from-[hsl(280,60%,50%)] to-[hsl(320,60%,50%)]",
  },
  {
    id: "mario",
    name: "سوبر ماريو أوديسي",
    nameEn: "Super Mario Odyssey",
    emoji: "🍄",
    path: "/mario",
    ready: false,
    color: "from-[hsl(0,70%,50%)] to-[hsl(30,80%,50%)]",
  },
  {
    id: "animal-crossing",
    name: "أنيمال كروسنق",
    nameEn: "Animal Crossing: New Horizons",
    emoji: "🌿",
    path: "/animal-crossing",
    ready: false,
    color: "from-[hsl(160,50%,45%)] to-[hsl(100,40%,50%)]",
  },
  {
    id: "fire-emblem",
    name: "فاير إمبلم",
    nameEn: "Fire Emblem Engage",
    emoji: "⚔️",
    path: "/fire-emblem",
    ready: false,
    color: "from-[hsl(220,60%,50%)] to-[hsl(250,50%,60%)]",
  },
];

const GameSelect = () => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <header className="relative flex flex-col items-center justify-center py-20 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary font-display font-semibold">منصة تعريب الألعاب</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-black mb-4 leading-tight">
            عرّب ألعابك{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-secondary to-primary">
              المفضلة
            </span>
          </h1>
          <p className="text-lg text-muted-foreground mb-2 max-w-lg mx-auto font-body">
            اختر اللعبة التي تريد تعريبها وابدأ مباشرة
          </p>
        </div>
      </header>

      {/* Game Cards */}
      <section className="flex-1 py-8 px-4">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {games.map((game) => {
            const content = (
              <div
                className={`group relative rounded-xl border border-border p-6 transition-all ${
                  game.ready
                    ? "bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 cursor-pointer"
                    : "bg-card/50 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center text-3xl mb-4`}>
                  {game.emoji}
                </div>
                <h3 className="text-lg font-display font-bold mb-1">{game.name}</h3>
                <p className="text-xs text-muted-foreground font-body mb-3" dir="ltr">
                  {game.nameEn}
                </p>
                {game.ready ? (
                  <Badge variant="default" className="bg-primary/20 text-primary border-primary/30">
                    جاهز ✅
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    قريباً 🔜
                  </Badge>
                )}
              </div>
            );

            return game.ready ? (
              <Link key={game.id} to={game.path}>
                {content}
              </Link>
            ) : (
              <div key={game.id}>{content}</div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto py-6 text-center text-sm text-muted-foreground border-t border-border">
        منصة تعريب الألعاب — مشروع مفتوح المصدر 🇸🇦
      </footer>
    </div>
  );
};

export default GameSelect;
