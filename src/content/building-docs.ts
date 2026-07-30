// נהלי הבניין — the building's procedure manual, ONE source of truth for two
// consumers: the /docs page (humans read it) and the assistant's system prompt
// (the LLM answers from it). Editing this file IS editing the manual — every
// change is a git commit, so the manual has history.
//
// Structure mirrors the physical binder: main sections → groups (e.g. routine
// vs emergency) → procedure entries. Content arrives from Moti (OCR of the
// binder); keep it plain text (rendered whitespace-pre-wrap). Entries with
// EMPTY content render as "coming soon" on /docs and are NOT fed to the
// assistant — it must never cite a procedure that hasn't been filled in.

export type BuildingDoc = {
  /** Stable id — used for selection in the docs page. */
  slug: string;
  title: string;
  content: string;
};

export type DocGroup = {
  /** Group header inside a section; null = ungrouped entries. */
  title: string | null;
  docs: BuildingDoc[];
};

export type DocSection = {
  title: string;
  groups: DocGroup[];
};

// ⚠️ Entries whose content is still my generic-safe placeholder (not yet the
// real binder text) are marked with [GENERIC] comments — replace as the OCR
// content arrives. Nothing here may contain invented specifics.
export const DOC_SECTIONS: DocSection[] = [
  {
    title: "נהלים וסדר פעולות",
    groups: [
      {
        title: null,
        docs: [
          {
            slug: "role-definition",
            title: "הגדרות התפקיד מפקיד לובי",
            content: `(ההוראות, ההנחיות וסדר הפעולות נכתבו בלשון זכר מטעמי נוחות בלבד, אך מיועדים לנשים וגברים כאחד.)
(מתייחסים למפקיד הלובי שעובד 24/7)

• מפקיד הלובי מחויב במוסר עבודה, מקצועיות ושירותיות ברמה גבוהה ביותר.
• חובה על מפקיד הלובי להקפיד על הופעה מסודרת, נקייה ואסתטית כשהוא לבוש במדי החברה (חולצה + עניבה, מכנס שחור, מקטורן ותג שם).
• עמדת הקבלה הינה "עמדה חיונית". עזיבת העמדה מותרת רק לטובת משימות עבודה מאושרות או שירותים (נוחיות).
• אחראי על שמירת הביטחון של הדיירים ופרטיותם, תוך ביצוע התהליכים עפ"י הכתוב במסמך זה והנחיות חברת הניהול וחברת רעם כפי שניתנות מעת לעת, בהתאם לצורך.
• אחראי על בקרת הכניסה הראשית למתחם — פיקוח, בקרה ובדיקת כל הנכנסים, סינון הנכנסים לפי סוגם וכוונתם, בהתאם לנהלים.
• בכל מקרה של ספק בזהות הנכנס יש לפנות באדיבות ובנחישות בצורה ישירה ולבצע בדיקה ותשאול למטרת הכניסה.
• מתן שירות לדיירי הבניין, אורחיהם ומבקרים מורשים.
• שמירה על סדר וניקיון והפעלת צוות הניקיון והאחזקה במידת הצורך.
• חוליה מקשרת בין הדיירים לחברת הניהול על מחלקותיה.
• רישום כל האירועים במהלך המשמרת, לרבות מסירה וקבלת מפתחות וקבלה ומסירת חבילות ודברי דואר ביומנים ייעודיים.
• רישום אירועים חריגים, כגון: אזעקות, תקלות, הודעות על מפגעים, אירועי אלימות וכו', ביומן האירועים.
• שליטה על המערכות בדלפק הקבלה — מחשב עבודה, מצלמות אבטחה, שטחים ציבוריים, מערכת אינטרקום, בקרת חניון, פאנל גילוי אש ומערכת כריזה, בקרת מעליות, בקרת מבנה, פאנל שליטה על כפתורי כניסה ראשית.
• אחראי לפקח על הנעשה במגדל ובסביבתו דרך מצלמות האבטחה: לזהות שלוחות ושערים סגורים, תנועות חשודות בחניון (שמעידות על גניבה או השחתה של רכוש), השגחה על חדרי שירות ופנאי וסריקת מצב בחדר הכושר ובריכת השחייה.
• התראה ודיווח על תקלות במערכות לאנשי הקשר לפי הנהלים, וסיוע במידע חיוני.
• השירות עבור הכלל — חל איסור מוחלט להתווכח ו/או להגיע למריבות עם כל אדם, בפרט דיירי המתחם. כל בעיה / תקלה כלשהי חובה לדווח למנהל המתחם.`,
          },
          {
            slug: "shift-start",
            title: "נוהל עלייה למשמרת",
            content: "",
          },
        ],
      },
      {
        title: "נהלים לאירועי שגרה",
        docs: [
          {
            // From the binder's role-definition pages (§17 נוהל כניסת קהל
            // מכניסה ראשית, resident half). Dedicated page may expand this.
            slug: "resident-entry",
            title: "נוהל כניסת דייר",
            content: `1. פתיחת דלת כניסה ראשית באחריות ובשליטת מפקיד הלובי.
2. מפקיד הלובי יפתח את הדלת לדיירים דרך כפתורי השליטה בדלפק.`,
          },
          {
            // From the binder's role-definition pages (§17 נוהל כניסת קהל
            // מכניסה ראשית, visitor half). Dedicated page may expand this.
            slug: "guest-entry",
            title: "נוהל כניסת אורח / שליח / מבקר",
            content: `1. כל מבקר יתושאל בלובי לסיבת הביקור, וכניסתו תאושר רק לאחר קבלת אישור מהדייר.
2. ללא קבלת אישור מהדייר לא תותר כניסת המבקר / האורח / בעל המקצוע.`,
          },
          { slug: "noise-prevention", title: "נוהל מניעת רעש", content: "" },
          {
            slug: "smoking-prevention",
            title: "נוהל מניעת עישון במרחב הציבורי",
            content: "",
          },
          {
            // From the binder's role-definition pages (§15). If a fuller
            // dedicated page arrives later, replace/merge here.
            slug: "mail-package",
            title: "נוהל דבר דואר / חבילה",
            content: `1. אין לקבל חבילות ללא שם מלא של הדייר ומספר דירה.
2. יש לרשום כל חבילה או מעטפה ביומן — גם במסירה וגם בקבלה.
3. יש לדווח לדייר על הגעת החבילה בהודעה אישית ב־WhatsApp.
4. אין לקבל חבילות מזון או מעטפות כסף (למעט מעטפות צ'קים לחברת הניהול).
5. יש להעביר מידע לגבי חבילות בין המשמרות.
6. חבילה מעל 48 שעות שלא נמסרה לדייר, במידה ולא ניתן ליצור קשר עם הדייר — יש לדווח למנהל המתחם.
7. חל איסור קבלת דואר רשום.`,
          },
          {
            // From the binder's role-definition pages (§16). If a fuller
            // dedicated page arrives later, replace/merge here.
            slug: "key-handover",
            title: "נוהל מסירת מפתחות",
            content: `1. לוודא את שם המוסר ושם המקבל כולל מספר דירה.
2. לרשום ביומן הייעודי פרטים מלאים.
3. מסירת מפתחות טכניים באישור אחראי אחזקה בלבד או לחלופין מנהל המתחם.`,
          },
          {
            slug: "fire-system-fault",
            title: "נוהל התראת תקלה במערכת הגילוי אש",
            content: "",
          },
          {
            slug: "unusual-event",
            title: "נוהל אירוע חריג (לא אירוע שבר / תקלה)",
            content: "",
          },
          { slug: "lost-item", title: "נוהל אבידה", content: "" },
          { slug: "breakage-fault", title: "נוהל שבר / תקלה", content: "" },
        ],
      },
      {
        title: "נהלים לאירועי חירום",
        docs: [
          {
            // [GENERIC] placeholder until the binder text arrives.
            slug: "fire-alert",
            title: "נוהל התראת אש",
            content: `1. בודקים בלוח כיבוי האש בלובי איזה אזור התריע.
2. אם מדובר בשריפה אמיתית — מתקשרים מיד לכיבוי אש 102 ומפעילים את נוהל הפינוי.
3. אין להשתמש במעליות בזמן שריפה — פינוי במדרגות בלבד.
4. אם מדובר בהתרעת שווא — מאפסים את הלוח ומתעדים את האירוע.
5. בכל מקרה מעדכנים את מנהל הבניין.`,
          },
          { slug: "gas-leak", title: "נוהל דליפת גז", content: "" },
          { slug: "flooding", title: "נוהל הצפה", content: "" },
          { slug: "power-outage", title: "נוהל הפסקת חשמל", content: "" },
          {
            // [GENERIC] placeholder until the binder text arrives.
            slug: "person-stuck-elevator",
            title: "נוהל אדם תקוע במעלית",
            content: `1. שומרים על קשר עם האדם דרך האינטרקום של המעלית — מרגיעים ומוודאים שמצבו תקין.
2. מתקשרים מיד לחברת שירות המעליות (המספר מופיע בתוך תא המעלית ובעמדת הלובי).
3. בשום מצב לא מנסים לפתוח את הדלתות בכוח ולא מחלצים לבד.
4. אם יש מצוקה רפואית — מתקשרים למד"א 101 ומעדכנים אותם שמדובר באדם לכוד במעלית.
5. מעדכנים את מנהל הבניין.`,
          },
          {
            slug: "suspicious-person",
            title: "נוהל אירוע אדם חשוד / גנב במגדל",
            content: "",
          },
        ],
      },
      {
        title: null,
        docs: [
          {
            // [GENERIC] placeholder until the binder text arrives.
            slug: "contacts",
            title: "דף אנשי קשר",
            content: `משטרה — 100
מד"א — 101
כיבוי אש — 102
פיקוד העורף — 104

בכל מצב של סכנת חיים מתקשרים קודם למוקד החירום המתאים, ורק אחר כך מעדכנים את מנהל הבניין.`,
          },
        ],
      },
    ],
  },
];

/** Flat view of the manual — each doc with its section/group breadcrumbs. */
export function flattenDocs(): {
  section: string;
  group: string | null;
  doc: BuildingDoc;
}[] {
  return DOC_SECTIONS.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.docs.map((doc) => ({ section: section.title, group: group.title, doc }))
    )
  );
}
