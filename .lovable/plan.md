

# توسيع القاموس من 10,824 إلى 16,000 سطر - الدفعات المتبقية

## الوضع الحالي
- **القاموس الحالي**: 10,824 سطر (الأقسام 1-63)
- **الهدف**: 16,000 سطر
- **المطلوب إضافته**: ~5,176 سطر جديد
- **المصدر**: ملف BDAT المُرفق (215,612 سطر، 16,146 نص فعلي)

## المحتوى الجديد المستخرج من ملف BDAT (5 دفعات)

### الدفعة 1: حوارات المستعمرات الفعلية (~1,100 سطر) - الأقسام 64-69
استخراج مباشر من `autotalk.bdat`:

**القسم 64: حوارات مستعمرة لامبدا الفعلية**
- حوارات كوجو والإصلاحات (Kouju's reforms)
- حوارات عن الليفنيسترات الكيفسية (Kevesi Levnisters)
- حوارات عن طلبات نقل الخدمة والأوضاع المتغيرة
- حوارات القائد إيسوروغي والأونيغيري

**القسم 65: حوارات المستعمرة 9 الفعلية**
- حوارات عن غياب نوح ويوني ولانز
- حوارات كايت وزيون والصراع الداخلي
- حوارات مشكلة الطعام وفوكس وكاميلا
- حوارات الأعداد المفقودة (Lost Numbers)

**القسم 66: حوارات القلعة والملكة**
- حوارات الحرس والعناصر التخريبية
- حوارات عن غوندور وشيكي
- حوارات عن الملكة نيا ومكانها السري

**القسم 67: حوارات المستعمرة 4 والمستعمرة تاو**
- حوارات عن نقص الإمدادات (طعام، دواء، أسطوانات أثير)
- حوارات عن توصيل المؤن وتغيير الجداول
- حوارات نيينا-ساما والاستدعاء

**القسم 68: حوارات القادة عن حفل بلوغ السن**
- حوارات الذين قاتلوا من أجل الحفل
- حوارات عن لوسيوني والحاجة لقوة الملكة
- حوارات تغيّر القواعد والقبول

**القسم 69: حوارات النوبونجا التجارية**
- حوارات بيع الطعام للجنود الأغنسيين
- حوارات المقتنيات والأسعار
- حوارات انهيار المنحدر والحظ

### الدفعة 2: نظام القتال الكامل (~1,100 سطر) - الأقسام 70-76
استخراج مباشر من `battle.bdat`:

**القسم 70: أوصاف تأثيرات الفنون القتالية**
- Side attack / Front Blowdown / Gain charge on hit
- AOE/Phys. Def. down / Pierce/Dmg to self
- Eva. up / Atk down / High aggro
- Evade / Self KO / Area heal on hit

**القسم 71: أوصاف المهارات والأحجار الكريمة التفصيلية**
- Boosts auto-attack damage by X%
- Boosts Critical Rate of auto-attacks by X%
- Boosts accuracy of auto-attacks by X%
- Boosts damage dealt when attacking enemies targeting you
- Boosts damage dealt indoors/outdoors
- Lowers attack targets' Break resistance

**القسم 72: مهارات الصد والامتصاص**
- When blocking, adds X% chance to reduce damage to 0
- When blocking, adds X% chance to absorb a physical/ether attack
- Absorb attacks taken while Art is active
- When blocking, deals X% of Attack damage to enemy
- When blocking, adds X% chance to reflect attack

**القسم 73: أسماء المهارات الخاصة**
- Field Duration Up / Longer Buff Timers / Longer Debuff Timers
- Slower Healing Aggro / Ouroboros Power Awakened
- Right Back At You / Natural Born Warrior / Sword of Reprisal
- Fighting Instinct / Gentleman's Valor / Mechanical Rhythm
- Initiative Effect: Break / Unbeatable / Faster Damage Aggro

**القسم 74: مهارات المراوغة والأغرو**
- Evasion Up (Art) / Ranged Evasion
- Eva. up / Faster aggro / Evade / High aggro

**القسم 75: أوصاف تأثيرات الحالة**
- Break / Topple / Daze / Burst / Launch / Smash
- Blaze / Frostbite / Doom / Bind

**القسم 76: أسماء فئات الفنون**
- Talent Art / Master Art / Fusion Art
- Physical Art / Ether Art

### الدفعة 3: المهام والأماكن الفعلية (~1,000 سطر) - الأقسام 77-82
استخراج مباشر من `quest.bdat`:

**القسم 77: أسماء وأوصاف مهام المستعمرات**
- Colony 15 Soldiers Missing + وصف تفصيلي
- Farewell Melody + وصف ليوناردو ورفاقه
- Forgotten Supplies + وصف حاوية نوح المفقودة
- Shared Secret + قصة ليوناردو وإيستمان
- Friendship + قصة ترايدن وجوغو

**القسم 78: أسماء مواقع المهام الفعلية**
- Michiba Canteen / Sentridge Harbor / Pioneer's Inlet
- Resonance Hill / Murmur Rise / High Morukuna Wildwood Area
- Monument of Life / Liberi Plaza / Station Breakroom

**القسم 79: أهداف المهام التفصيلية**
- Make a Spongy Spud supper at the Colony Mu Canteen
- Find a Bright Fig in Morukuna Wildwood
- See off Leonardo's squad
- Head for Captocorn Ridge / Reach the southern Aetia region

**القسم 80: أوصاف نتائج المهام**
- Thanks to the Colony 15 soldiers' sterling work...
- Unfortunately, Jougo died as you were searching...
- The party found the unrecovered container...

**القسم 81: آثار وتتبع ميداني**
- Somebody's Tracks / Herbivore Tracks / Monster Tracks
- Deserters' Footprints / Deserters' Trail / Fugitive's Footprints
- Gin's Tracks / Burebure's Tracks / Levnis Tracks
- Mystery Agnian Trail / Child's Footprints / Unidentified Tracks
- Robobuddy's Log / Trace Clock Energy

**القسم 82: عناوين أحداث الروابط**
- Tutor: Mio / Isora's Request / Colony 0's Future
- Life in Li Garte Prison / Prison Problems / Mystery Ferron
- Sena and No. 9 / Colony 0 Duties / The Name "Nagiri"
- A Need for Names / Herding Monsters / Tactician's Plan
- Colony 4 Revitalized / The Poisoner / Curious About Training / Irritation

### الدفعة 4: أسماء الأعداء والمواد الكاملة (~1,000 سطر) - الأقسام 83-89
استخراج مباشر من `system.bdat`:

**القسم 83: عائلة التيركين كاملة**
- Arrow Tirkin / Bard Tirkin / Squire Tirkin / Lancer Tirkin / Archer Tirkin
- Musical Tirkin / Knightlord Tirkin / Pikelord Tirkin / Bowlord Tirkin
- Bardlord Tirkin / Archknight Tirkin / Archpike Tirkin / Archbow Tirkin
- Ironclad Tirkin (موجود مسبقاً - تجنب)

**القسم 84: عائلة السكيتر والروغول**
- Selurine Skeeter / Baruka Skeeter / Venomtail Skeeter
- Sky Rhogul / Arogan Rhogul / Brute Rhogul / Smart Rhogul

**القسم 85: عائلة الأنسل والروبل**
- Brute Ansel / Scarred Ansel
- Colnicas Ropl / Bemot Ropl / Rockheart Ropl / Odolera Ropl

**القسم 86: مواد وفواكه وخضروات**
- Walnut Grape / Sour Gooseberry / Humming Plum / Red Durian
- Ether Plum / Dry Lemon / Sweet Wasabi / Cool Potato
- Baggy Swede / Amethyst Vanilla / Ice Cabbage / Tootshroom

**القسم 87: أحجار ومعادن ومقتنيات**
- Clicky Topaz / Icicle Marine / Wool Rock / Orbshell

**القسم 88: أطباق وأسماء وصفات**
- Mild Game Stew / Acqua Pazza a la City / Spongy Spud supper

**القسم 89: أسماء NPCs والجنود**
- Mamimaa / Siljil / Napapa / Koma / Momama
- Keves Soldier A/B / Lost Nos. Soldier A/B
- Colony 9 Soldier / Agnus Soldier / Agnus Captain / Armory Pilot

### الدفعة 5: حوارات ميدانية وإمدادات متبقية (~976 سطر) - الأقسام 90-95
استخراج من `field.bdat` و`autotalk.bdat` المتبقي:

**القسم 90: حوارات الاستكشاف والاكتشاف**
- It is better to collect it / Could it be...? / A good find
- That light... / An ether channel, as I thought
- A cave...? I wonder what is inside / Come here!
- A survivor from the City. Let's protect them

**القسم 91: حوارات الإمدادات والتموين**
- The remaining stock in the storehouse is... only 20% left
- Aren't our supplies dwindling too quickly?
- It just means our allies are in trouble
- It's a real pain not having supplies from the Castle
- We're actually doing pretty well. We have a stockpile

**القسم 92: حوارات أوضاع ما بعد التحرير**
- This mission is different from the usual. Be careful
- Equipment and ether cylinders... They're lacking everything
- About the supplies we're sending to Colony Tau
- That can wait! The schedule has changed

**القسم 93: حوارات القلعة والحرس**
- The Guard temporarily closed the entrance and exit
- Did some subversive elements sneak in?
- The Captain of the Guard has it tough
- It was more peaceful when the Consuls were around

**القسم 94: حوارات الإصلاح والصيانة**
- Even if I wanted to fix it, Camilla doesn't have any parts
- Oh no... It finally broke, huh...
- Let's take that over to Harala's place
- We might be able to use it if we repair it

**القسم 95: حوارات متنوعة من المستعمرات المتبقية**
- It's a punishment device... / Let's hurry
- It seems they are in some trouble / Look
- Mm...? / This isn't the time to be fighting amongst ourselves

## المنهجية

1. **استخراج مباشر**: كل نص مأخوذ حرفياً من ملف BDAT المُرفق
2. **دمج الأسطر**: الجمل متعددة الأسطر تُدمج في سطر واحد بمسافات
3. **فحص التكرار**: مقارنة مع الأقسام 1-63 الموجودة لتجنب أي تكرار
4. **توحيد المصطلحات**: الالتزام بالمعايير (الأثير، القنصل، المستعمرة، مُنشد الوداع، الأوريجن)
5. **الترجمة الدقيقة**: ترجمة أدبية تحافظ على السياق مع قيد طول 1.5x

## الملف الهدف
- `public/xc3-full-glossary.txt` - إلحاق بعد السطر 10,824
- **النتيجة المتوقعة**: ~16,000 سطر

## التفاصيل التقنية
- الملف هو ملف نصي بسيط بصيغة `English=Arabic`
- كل قسم يبدأ بترويسة `# ═══...` مع رقم القسم واسمه
- الأقسام الفرعية تبدأ بـ `# --- اسم القسم ---`
- يتم إلحاق المحتوى الجديد في نهاية الملف مباشرة

