# דה-באגינג: למה הקארדיו הציג "TC 800'"

תאריך: 2026-03-04
תופעה: בלוח הקארדיו הופיע כפתור טיימר יחיד עם תווית `▶ TC 800'` — כלומר Time Cap של 800 דקות (13 שעות). זה לא תואם לכוונת המאמן.

## תוכן התא (CARDIO)

מה שהמאמן כתב בגיליון (משוחזר מהצילום):

```
16 min tc
800m run
20 box step-ups (holding KB)
20 sumo squat jump
500m run
18 box step-ups
18 sumo squat jump
200m run
16 box step-ups
16 sumo squat jump
                          ← שורה ריקה (__SPACER__)
2 min rest:
                          ← שורה ריקה (__SPACER__)
16 min
800 row
20 push up
20 v-up
500 row
18 push up
18 v-ups
200 row
16 push up
16 v-ups
```

הכוונה הברורה: **שני בלוקים של 16 דקות עם 2 דקות מנוחה ביניהם.**
הראוי שייצא: כפתור טיימר משורשר `16′ work / 2:00 rest ×2`, או — לכל הפחות — שני כפתורים נפרדים `TC 16'`.

## מה יצא בפועל

כפתור יחיד: `TC 800'`. כלומר `{ type: 'fortime', capSeconds: 48000, label: 'TC 800′' }`.

## תרגיל אימות (Node)

הופעלה ה-regex של TC על מחרוזת התא:

```js
const text = lines.join('\n');
text.match(/\bt\.?\s*c[\-\s:]*(\d+(?::\d{2})?)/i);
// → match: "tc\n800", capture: "800"
```

## שורש הבעיה — שני באגים מצטרפים

### באג 1: ה-regex של TC בולע מספר משורה אחרת

ב-[index.html:2150](index.html#L2150):

```js
let tcMatch = text.match(/\bt\.?\s*c[\-\s:]*(\d+(?::\d{2})?)/i);
```

המחלקה `[\-\s:]*` כוללת `\s`, ש-**מתאים גם ל-`\n`**. לכן ה-regex מוצא `tc` בסוף השורה הראשונה, חוצה את ה-newline, וחוטף את `800` משורת `800m run` הבאה.

תוצאה: `capSeconds = 800 * 60 = 48000` שניות. ה-label נבנה ב-[index.html:2356](index.html#L2356):

```js
results.push({ type: 'fortime', capSeconds, label: `TC ${Math.floor(capSeconds/60)}′` });
// → label: "TC 800′"
```

הכלל הזה (סעיף `else if` ב-[index.html:2355](index.html#L2355)) רץ כי `results.length === 0` (שום regex אחר לא תפס כלום — ראה באג 2).

### באג 2: "16 min tc" לא מזוהה כשלב עבודה

`buildWorkoutTimeline` ב-[index.html:2065](index.html#L2065) סורק שורה-שורה ומחפש דפוסי WORK:

- `AMRAP N` / `N min AMRAP` — לא מתאים
- `EMOM N` / `E2MOM N` — לא מתאים
- `every X:XX ×N` — לא מתאים
- `N min work` — לא מתאים (אין "work")
- `M:SS work` — לא מתאים

**אין דפוס שתופס `N min tc` או `N min` עירום.**

תוצאה: 0 שלבי WORK + 1 שלב REST (משורת `2 min rest:`). תנאי הטיימר המשורשר ב-[index.html:2166](index.html#L2166) דורש `tlWork.length >= 2` — נופל. שום AMRAP/EMOM/Tabata/"For Time" לא מופיע במלל. נופלים על ה-`else if` של ה-capSeconds — שמכיל את הערך השגוי 48000.

## ההצטרפות

| צעד | מה קרה |
|---|---|
| `buildWorkoutTimeline` | החזיר 0 work, 1 rest → אין שרשור |
| `AMRAP`/`EMOM`/`Tabata`/`For Time` | לא נמצאו → `results.length === 0` |
| `TC` regex | נתפס לא נכון על `tc\n800` → `capSeconds = 48000` |
| Fallback ב-2355 | דחף `TC 800'` כברירת מחדל |

## תיקונים מוצעים (לא בוצעו — דה-באגינג בלבד)

### תיקון מינימלי — מנוע באג 1 (חוצה שורות)

ב-[index.html:2150](index.html#L2150), להחליף `\s` ב-`[ \t]` כדי שלא יחצה newline:

```js
let tcMatch = text.match(/\bt\.?[ \t]*c[\-:\s]*?(\d+(?::\d{2})?)/i);
// או, בצורה ברורה יותר — לסרוק שורה-שורה:
let capSeconds = 0;
for (const l of lines) {
  const mm = (l || '').match(/\bt\.?[ \t]*c[\-: \t]+(\d+(?::\d{2})?)\b/i);
  if (mm) { capSeconds = mm[1].includes(':') ? parseInt(mm[1].split(':')[0])*60+parseInt(mm[1].split(':')[1]) : parseInt(mm[1])*60; break; }
}
```

זה לבדו יוריד את `TC 800'` ל-`TC 0'` כי בנוסח `16 min tc` ה-TC בא **אחרי** המספר, וה-regex הקיים מצפה ל-TC לפני המספר. כלומר התקלת-המראה תיעלם אבל לא ייצא כלום במקום.

### תיקון מבני — מנוע באג 2 (TC אחרי המספר + בלוקי 16 min)

ב-`buildWorkoutTimeline` ב-[index.html:2095](index.html#L2095), להוסיף דפוס לפני "N min work":

```js
// WORK: "N min tc" / "N min t.c" — Time Cap בכתיב המאמן (TC אחרי המספר)
wm = line.match(/^\s*(\d+)\s*min(?:utes?)?\s+t\.?\s*c\b/i);
if (wm) { const n=parseInt(wm[1]); if (pushPhase(classified, { type:'work', seconds:n*60, label:`${n}′ TC` })) continue; }
```

עם זה, הקארדיו של הצילום ייצור: `[work 16′ TC, rest 2′, work ???]`. הבעיה השנייה — `16 min` עירום (בלי `tc`) — נשארת אמביוולנטית; אם רוצים לתפוס גם אותו, צריך כלל הקשרי ("בלוק חוזר ב-DSL אחרי rest").

### תיקון להחזיר ערך לא-ריק כשה-cap נמצא ב-TC-אחרי-מספר

גם הענף הראשי של ה-TC ב-[index.html:2150](index.html#L2150) צריך לתפוס TC אחרי המספר:

```js
let tcMatch = null;
for (const l of lines) {
  let mm = l.match(/\bt\.?[ \t]*c[\-: \t]+(\d+(?::\d{2})?)\b/i);  // לפני המספר
  if (!mm) mm = l.match(/\b(\d+(?::\d{2})?)[ \t]*(?:min(?:utes?)?[ \t]+)?t\.?[ \t]*c\b/i);  // אחרי המספר
  if (mm) { tcMatch = mm; break; }
}
```

## בדיקות שצריך להריץ אחרי תיקון

| קלט | ציפייה |
|---|---|
| `"16 min tc\n800m run\n..."` | `TC 16'` או `16′ TC ×2 / 2:00 rest` (אם גם בלוק העבודה השני יזוהה) |
| `"t.c 42\n800m run"` | `TC 42'` (לוודא שלא הוחלשו דפוסי TC הקיימים) |
| `"AMRAP 16\n..."` | `AMRAP 16'` (לוודא שלא נשבר) |
| `"For Time\nt.c 16\n..."` | `For Time (TC 16′)` |
| `"5 min work\n2 min rest\n5 min work\n2 min rest\n5 min work"` | `AMRAP ×3 · 5′ work / 2′ rest` (chained — לוודא שלא נשבר) |

## הקבצים הרלוונטיים

- [index.html:2065-2138](index.html#L2065-L2138) — `buildWorkoutTimeline`
- [index.html:2142-2382](index.html#L2142-L2382) — `detectTimers`
- [index.html:2150](index.html#L2150) — ה-regex של ה-cap (באג 1)
- [index.html:2355-2357](index.html#L2355-L2357) — ה-fallback שדחף את ה-`TC 800'`
- [index.html:4226](index.html#L4226) — נקודת הקריאה (`extractTimerConfigs(cell.lines)`)
- `sw.js` — כשמיישמים, חובה להעלות `CACHE_NAME` (עכשיו v79)
