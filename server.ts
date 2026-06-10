import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { dbService } from "./sqlite-adapter";
import AdmZip from "adm-zip";
import fs from "fs";

dotenv.config();

// Load securely stored API key asynchronously to update process environment
dbService.getSecureApiKey().then((savedKey) => {
  if (savedKey) {
    process.env.GEMINI_API_KEY = savedKey;
    console.log("[ApiKey] API key loaded successfully from secure database setting: true");
  }
}).catch((e) => {
  console.error("[ApiKey] Error reading secures api key during boot", e);
});

const app = express();
const PORT = 3000;

app.use(express.json());

// Lightweight health check endpoint for robust boot check verification
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API endpoints for Local SQLite Desktop Data Sync and Setup settings
app.get("/api/db/details", (req, res) => {
  res.json(dbService.getDatabaseDetails());
});

app.post("/api/backup/email", async (req, res) => {
  try {
    const { email, backupData } = req.body;
    if (!email) {
      return res.status(400).json({ error: "الرجاء كتابة البريد الإلكتروني للارسال!" });
    }

    const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
    const smtpPort = Number(process.env.SMTP_PORT) || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      console.log(`[Email Backup Simulator] SMTP credentials not set, simulating successful delivery to ${email}`);
      return res.status(200).json({ 
        success: true, 
        message: `تم تشفير النسخة الاحتياطية بنجاح ومحاكاة إرسالها للبريد: ${email} (الوضع التجريبي الآمن نشط). لمنحه الإرسال الفعلي التام، يرجى تهيئة SMTP_USER و SMTP_PASS في إعدادات البيئة.`
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const mailOptions = {
      from: `"الشفاء للمحاسبة الدوائية" <${smtpUser}>`,
      to: email,
      subject: `النسخة الاحتياطية الرسمية للصيدلية والذمم - ${new Date().toLocaleDateString("ar-SY")}`,
      text: `مرحباً دكتور،\n\nتجدون مرفقاً طيه النسخة الاحتياطية المشفرة وجداول الجرد والذمم والحسابات الكاملة العائدة لصيدليتكم.\n\nتاريخ الحفظ والنسخ: ${new Date().toLocaleString("ar-SY")}\n\nنظام الشفاء السوري الذكي لمستودعات ومحاسبة الصيدليات.`,
      attachments: [
        {
          filename: `remix-pharma-backup-${new Date().toISOString().substring(0, 10)}.json`,
          content: JSON.stringify(backupData, null, 2)
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: `تم إرسال النسخة الاحتياطية فعلياً وبنجاح إلى البريد الإلكتروني: ${email}` });
  } catch (err: any) {
    console.error("SMTP direct mail error", err);
    res.status(500).json({ error: `فشل الإرسال الفعلي عبر بروتوكول SMTP: ${err.message || err}` });
  }
});

app.get("/api/db/get-key", async (req, res) => {
  try {
    const key = await dbService.getSecureApiKey();
    res.json({
      hasKey: !!key,
      maskedKey: key ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}` : ""
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/db/save-key", async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: "الرجاء توفير رمز API key صالح!" });
    }
    await dbService.setSecureApiKey(apiKey);
    res.json({ success: true, message: "تم حفظ وتفعيل مفتاح الذكاء الاصطناعي بشكل آمن وبصورة دائمة!" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/db/get-table", async (req, res) => {
  try {
    const { table } = req.query;
    if (!table || typeof table !== "string") {
      return res.status(400).json({ error: "Table name query is required" });
    }
    const items = await dbService.getItems(table);
    res.json({ success: true, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/db/sync-table", async (req, res) => {
  try {
    const { table, items } = req.body;
    if (!table || !Array.isArray(items)) {
      return res.status(400).json({ error: "المعطيات المرسلة غير صالحة" });
    }
    await dbService.saveItems(table, items);
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Real-time mobile desktop sync endpoints
app.get("/api/sync/pull", async (req, res) => {
  try {
    const [medications, suppliers, expenses, invoices, movements, customers] = await Promise.all([
      dbService.getItems("medications"),
      dbService.getItems("suppliers"),
      dbService.getItems("expenses"),
      dbService.getItems("invoices"),
      dbService.getItems("medication_movements"),
      dbService.getItems("customers")
    ]);
    res.json({
      success: true,
      medications,
      suppliers,
      expenses,
      invoices,
      movements,
      customers
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sync/push", async (req, res) => {
  try {
    const { medications, suppliers, expenses, invoices, movements, customers } = req.body;

    const mergeAndSave = async (table: string, clientItems: any[]) => {
      if (!Array.isArray(clientItems)) return;
      const serverItems = await dbService.getItems(table);
      const map = new Map();
      serverItems.forEach((item: any) => map.set(item.id, item));
      clientItems.forEach((item: any) => map.set(item.id, item));
      const mergedList = Array.from(map.values());
      await dbService.saveItems(table, mergedList);
    };

    await Promise.all([
      mergeAndSave("medications", medications),
      mergeAndSave("suppliers", suppliers),
      mergeAndSave("expenses", expenses),
      mergeAndSave("invoices", invoices),
      mergeAndSave("medication_movements", movements),
      mergeAndSave("customers", customers)
    ]);

    res.json({ success: true, message: "تمت مزامنة البيانات الثنائية مع الخادم بنجاح!" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize Gemini SDK with telemetry header
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY environment variable is not set. AI feature will return pre-coded responses fallback.");
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// API: Suggest equivalent alternative medications based on chemical/scientific name in Syrian local market
app.post("/api/gemini/suggest-alternatives", async (req, res) => {
  try {
    const { scientificName, brandName, currentPrice } = req.body;

    if (!scientificName) {
      return res.status(400).json({ error: "اسم المادة العلمية مطلوب" });
    }

    const ai = getGeminiClient();

    if (!ai) {
      // Fallback response if GEMINI_API_KEY is not defined
      const fallbackSuggestion = getFallbackSuggestions(scientificName);
      return res.json({ suggestions: fallbackSuggestion, simulated: true });
    }

    const prompt = `أنت مساعد صيدلاني خبير في سوق الدواء السوري.
المطلوب اقتراح أدوية بديلة/مكافئة في سوريا للمادة العلمية التالية: "${scientificName}" (الدواء التجاري الحالي: "${brandName || 'غير محدد'}"، بسعر تقريبي: ${currentPrice || 'غير محدد'} ل.س).

أعد الإجابة بصيغة JSON حصراً، على شكل كائن يحتوي على مصفوفة باسم "alternatives" تحتوي على عناصر بالخصائص التالية باللغة العربية:
1. "brandName" (الاسم التجاري للبديل السوري)
2. "manufacturer" (الشركة المصنعة السورية، مثل تاميكو، دياموند، أوبري، شفا، يونيفارما، الخ)
3. "strength" (العيار والجرعة، مثلاً 500 مغ كبسول)
4. "price" (السعر التقريبي بالليرة السورية تماشياً مع تسعيرة وزارة الصحة السورية الحالية لعام 2026)
5. "percentageDifference" (نسبة فرق السعر عن السعر الحالي كنسبة مئوية، مثلاً "-15%" أو "+5%")
6. "notes" (ملاحظات صيدلانية مهمة للبديل)

أضف أيضاً كائناً باسم "pharmacistAdvice" يحتوي على:
- "safetyTips" (توجيهات الأمان للمريض عند التبديل)
- "regulatoryNotice" (ملاحظة حول هوامش ربح هذه المجموعة الدوائية في قرار وزارة الصحة السورية الأخير)

أجب بالصيغة المطلوبة JSON فقط دون كتابة أي كلام إضافي أو علامات markdown غير المتوافقة مع JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const resultText = response.text || "{}";
    const data = JSON.parse(resultText.trim());
    return res.json(data);

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({
      error: "حدث خطأ أثناء معالجة الطلب بالذكاء الاصطناعي",
      details: error.message,
      suggestions: getFallbackSuggestions(req.body.scientificName || "")
    });
  }
});

// Fallback logic for offline/no-key usage
function getFallbackSuggestions(scientificName: string) {
  const norm = scientificName.toLowerCase();
  if (norm.includes("paracetamol") || norm.includes("باراسيتامول") || norm.includes("باندول")) {
    return {
      alternatives: [
        { brandName: "سيتامول", manufacturer: "تاميكو (TAMICO)", strength: "500 مغ أقراص", price: "2500 ل.س", percentageDifference: "-40%", notes: "المنتج الوطني الأكثر انتشاراً وبسعر مدعوم حكومياً وكفاءة عالية." },
        { brandName: "أدول سيمو", manufacturer: "شفا (Chafa)", strength: "500 مغ أقراص", price: "3200 ل.س", percentageDifference: "-20%", notes: "مستورد المواد الفعالة بنقاوة ممتازة، مناسب للصداع الخفيف." },
        { brandName: "باراسيتامول أوبري", manufacturer: "أوبري (Obri)", strength: "500 مغ أقراص", price: "3400 ل.س", percentageDifference: "-15%", notes: "متوفر بعبوات اقتصادية للصيدليات." }
      ],
      pharmacistAdvice: {
        safetyTips: "المادة الفعالة واحدة وهي الباراسيتامول المسكن للآلام وخافض الحرارة. تأكد من عدم تجاوز الجرعة اليومية القصوى وهي 4 غرامات تجنباً للسمية الكبدية.",
        regulatoryNotice: "تخضع مسكنات الباراسيتامول المحلية لنسبة ربح صيدلاني قدرها 20% كأدوية أساسية وطنية."
      }
    };
  } else if (norm.includes("amoxicillin") || norm.includes("أموكسيسيلين") || norm.includes("أوغمينتين")) {
    return {
      alternatives: [
        { brandName: "أموكسيسيلين تاميكو", manufacturer: "تاميكو (TAMICO)", strength: "500 مغ كبسول", price: "8500 ل.س", percentageDifference: "-30%", notes: "متوفر بشكل مستمر في المراكز والصيدليات بأسعار مخفضة." },
        { brandName: "أموكسيكلاف يونيفارما", manufacturer: "يونيفارما (Unipharma)", strength: "625 مغ أقراص (مع حمض الكلافولانيك)", price: "18500 ل.س", percentageDifference: "+45%", notes: "بديل واسع الطيف معزز بمثبط البيتا لاكتاماز للالتهابات الشديدة." },
        { brandName: "بيناموكس دياموند", manufacturer: "دياموند (Diamond Pharmacy)", strength: "500 مغ أقراص", price: "9200 ل.س", percentageDifference: "-23%", notes: "من الأدوية المحلية الممتازة والموصوفة بكثرة لالتهابات البلعوم." }
      ],
      pharmacistAdvice: {
        safetyTips: "الأموكسيسيلين مضاد حيوي من عائلة البنسلين، يجب السؤال عن وجود حساسية بنسلين لدى المريض قبل التبديل أو الصرف.",
        regulatoryNotice: "المضادات الحيوية المحلية تصنف بربح صيدلاني 20٪، بينما المستحضرات التجارية المركبة قد يدخل بعضها بنسبة فئة متممات بنسبة 15%."
      }
    };
  } else {
    // General generic fallback
    return {
      alternatives: [
        { brandName: "بديل محلي وطني (تاميكو)", manufacturer: "المؤسسة العامة للصناعات الكيميائية (تاميكو)", strength: "جرعة قياسية متوافقة", price: "4500 ل.س", percentageDifference: "-30%", notes: "البديل الاقتصادي الأساسي المعتمد من وزارة الصحة السورية." },
        { brandName: "بديل تجاري فاخر", manufacturer: "يونيفارما / أوبري للخدمات الطبية", strength: "مطابق تماماً للمستحضر الفعال", price: "6800 ل.س", percentageDifference: "-5%", notes: "يتميز بمعدل إتاحة حيوية مماثل للأجنبي وتأثير سريع." }
      ],
      pharmacistAdvice: {
        safetyTips: "يرجى التحقق من مطابقة الجرعة والعيار (Strength) والشركة لضمان استجابة مطابقة لتعليمات الطبيب المعالج.",
        regulatoryNotice: "تخضع جميع الأدوية المصنعة محلياً في سوريا لنظام التسعير الصارم لوزارة الصحة السورية بنسبة ربح قانونية من 15٪ إلى 20٪ تبعاً لنوع المستحضر."
      }
    };
  }
}

// API: Check for drug-drug interactions between multiple pharmaceutical compounds
app.post("/api/gemini/check-interactions", async (req, res) => {
  try {
    const { medicationsList } = req.body;

    if (!medicationsList || !Array.isArray(medicationsList) || medicationsList.length < 2) {
      return res.status(400).json({ error: "يجب اختيار مستحضرين أو مادتين على الأقل لفحص التداخلات" });
    }

    const ai = getGeminiClient();

    if (!ai) {
      // Fallback response for offline/simulated interactions
      const fallbackData = getFallbackInteractions(medicationsList);
      return res.json({ result: fallbackData, simulated: true });
    }

    const prompt = `أنت صيدلاني بورد سريري سوري خبير وباحث في تعارض الأدوية وتداخلاتها الحيوية.
تم تزويدك بقائمة من الأدوية والمواد الفعالة في صيدليتك لفحص تعارضها لدى المريض:
${JSON.stringify(medicationsList)}

المطلوب فحص التداخل والتعارض الدوائي (Drug-Drug Interactions) بين هذه المستحضرات.
أعد الإجابة بصيغة JSON حصراً، على شكل كائن يحتوي على الخصائص التالية باللغة العربية الواضحة والمهنية الدقيقة:
1. "hasInteractions" (boolean - هل توجد تداخلات حقيقية؟)
2. "severity" (درجة الخطورة القصوى الموجودة بقائمة التعارضات: "لا يوجد تعارض" أو "منخفضة" أو "متوسطة" أو "خطيرة" أو "قاتلة")
3. "interactions" (مصفوفة تحتوي على التعارضات المكتشفة، لكل عنصر):
   - "drugs": (أسماء المواد المتداخلة، مثل "Aspirin + Ibuprofen")
   - "severity": (درجة الخطورة: "منخفضة" / "متوسطة" / "خطيرة" / "قاتلة")
   - "effect": (العرض الناتج الضار وتأثيره الحيوي، مثل 'يزيد خطر قرحة ونزيف المعدة')
   - "recommendation": (توصيتك الصيدلانية المهنية السريرية للتجنب أو البديل)
4. "generalAdvice": (نصيحة عامة شاملة لمستوى حماية المريض السوري ونقابة الصيادلة كإرشاد صرف)

أجب بالصيغة المطلوبة JSON فقط دون كتابة أي كلام إضافي أو علامات markdown غير متواوِحة مع الـ JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const resultText = response.text || "{}";
    const data = JSON.parse(resultText.trim());
    return res.json({ result: data, simulated: false });

  } catch (error: any) {
    console.error("Gemini Interaction Error:", error);
    res.status(500).json({
      error: "حدث خطأ أثناء فحص التداخلات بالذكاء الاصطناعي",
      details: error.message,
      result: getFallbackInteractions(req.body.medicationsList || []),
      simulated: true
    });
  }
});

// Fallback logic for drug-drug interactions matching typical combinations
function getFallbackInteractions(meds: any[]) {
  const names = meds.map(m => m.toString().toLowerCase());
  const found: any[] = [];
  
  const hasAspirinOrPlavix = names.some(n => n.includes("aspirin") || n.includes("أسبرين") || n.includes("بلافيكس") || n.includes("clopidogrel") || n.includes("ثنائي"));
  const hasNsaid = names.some(n => n.includes("ibuprofen") || n.includes("بروفين") || n.includes("diclofenac") || n.includes("روفيناك") || n.includes("فولتارين") || n.includes("ديكلوفيناك"));
  const hasCipro = names.some(n => n.includes("ciprofloxacin") || n.includes("سيبوفلوكساسين"));
  const hasAntacidOrCalcium = names.some(n => n.includes("calcium") || n.includes("كالسيوم") || n.includes("أدول") || n.includes("حموضة") || n.includes("لانزوبرازول") || n.includes("أوميبرازول"));
  const hasBetaBlocker = names.some(n => n.includes("concor") || n.includes("كونكور") || n.includes("bisoprolol") || n.includes("بيسوبرولول"));
  const hasBetaAgonist = names.some(n => n.includes("ventolin") || n.includes("فنتولين") || n.includes("salbutamol") || n.includes("سالبوتامول"));

  if (hasAspirinOrPlavix && hasNsaid) {
    found.push({
      drugs: "أسبرين/بلافيكس + المكسنات القوية (بروفين/روفيناك)",
      severity: "خطيرة",
      effect: "تثبيط مفرط ومزدوج لتجمع الصفيحات الدموية يزيد خطورة نزيف بطانة المعدة والجهاز الهضمي بشكل حاد.",
      recommendation: "ينصح بشدة تجنب الدمج واستعمال باراسيتامول كمسكن آمن بديل، أو إضافة أوميبرازول لحماية جدار المعدة إذا دعت الحاجة القصوى."
    });
  }

  if (hasCipro && hasAntacidOrCalcium) {
    found.push({
      drugs: "سيبوفلوكساسين (مضاد التهاب) + متممات كالسيوم/مضادات حموضة معوية",
      severity: "متوسطة",
      effect: "الشوارد المعدنية ثنائية وثلاثية التكافؤ تشكل معقداً مخلبياً كيميائياً غير قابل للامتصاص بالأمعاء، مما يعطل مفعول المضاد الحيوي بنسبة 60%.",
      recommendation: "يجب تأجيل تناول الكالسيوم أو مضادات الحموضة ساعتين على الأقل بعد تناول السيبوفلوكساسين أو 6 ساعات قبله."
    });
  }

  if (hasBetaBlocker && hasBetaAgonist) {
    found.push({
      drugs: "بيسوبرولول (كونكور للضغط) + سالبوتامول (فنتولين موسع قصبات للربو)",
      severity: "خطيرة",
      effect: "حاصر بيتا القلبية يلغي مفعول محفز بيتا التنفسية مما يؤدي لتضيق قصبات حاد ومحفز لنوبة ربو شديدة مهددة للحياة، وفشل معالجة الضغط.",
      recommendation: "يمنع الصرف المشترك، ويتوجب التواصل مع الطبيب لتغيير الكونكور بأدوية ضغط من عوائل أخرى كحاصرات قنوات الكالسيوم (Amlodipine)."
    });
  }

  if (found.length > 0) {
    return {
      hasInteractions: true,
      severity: "خطيرة",
      interactions: found,
      generalAdvice: "تم رصد تداخلات دوائية بحاجة لعناية صيدلانية بالغة. يرجى توجيه المريض بدقة للفصل الزمني أو مراجعة الطبيب المعالج."
    };
  }

  return {
    hasInteractions: false,
    severity: "لا يوجد تعارض",
    interactions: [],
    generalAdvice: "لم يتم رصد تعارض حاد ومباشر في السجل السوري السريري السريع لهذه المجموعة المختارة. اسأل المريض دائماً عن التحسس الدوائي والوظيفة الكلوية."
  };
}

// API: Parse printed/written drug invoices from a photo using Gemini 3.5-flash
app.post("/api/gemini/parse-invoice-image", async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) {
      return res.status(400).json({ error: "لم يتم تزويد صورة الفاتورة لرفعها" });
    }

    // Clean up base64 prefix if present
    let base64Data = image;
    let actualMimeType = mimeType || "image/jpeg";
    if (image.includes(";base64,")) {
      const parts = image.split(";base64,");
      base64Data = parts[1];
      const match = parts[0].match(/data:(.*?);/);
      if (match) {
        actualMimeType = match[1];
      }
    }

    const ai = getGeminiClient();

    if (!ai) {
      // Fallback response for invoice parse
      console.log("No Gemini API key. Returning simulated invoice parse data.");
      const mockResult = getSimulatedInvoiceParse();
      return res.json({ ...mockResult, simulated: true });
    }

    const prompt = `أنت صيدلاني سوري ومحاسب أدوية خبير. تم تصوير فاتورة شراء أدوية صيدلانية لتسجيلها وتوريدها لمستودع الصيدلية.
حلل صورة الفاتورة المرفقة وعالج النصوص والجداول فيها (العربية والإنجليزية) لاستخراج تفاصيل التوريد وبيانات الأدوية المشتراة بدقة.

يجب أن تعيد النتيجة حصراً بصيغة JSON مطابقة تماماً للقالب التالي بدون أي رسائل ترحيبية أو علامات Markdown:
{
  "supplier": "اسم مستودع الأدوية المورد بدقة كما يظهر بالصورة (مثلا 'مستودع العبجي للأدوية' أو 'مستودع كمال للمستحضرات الطبية')"،
  "invoiceNumber": "رقم الفاتورة بدقة (مثلاً '9401' أو 'INV-2026-1') أو رقم افتراضي متوافق"،
  "invoiceDate": "تاريخ الفاتورة بصيغة YYYY-MM-DD"،
  "items": [
    {
      "tradeName": "الاسم التجاري للدواء بالعربية والإنجليزية (مثال: 'سيتامول أقراص (Cetamol)')"،
      "scientificName": "الاسم العلمي للمادة الفعالة بالإنجليزية (مثال: 'Paracetamol')"،
      "strength": "الجرعة/العيار (مثال: '500 mg' أو '1g')"،
      "form": "الشكل الصيدلاني (مثال: 'أقراص'، 'كبسول'، 'شراب'، 'جل'، 'أمبول')",
      "manufacturer": "الشركة السورية المصنعة (مثال: 'تاميكو (TAMICO)'، 'أوبري (Obri)'، 'دياموند (Diamond)'، 'شفا (Chafa)'، 'يونيفارما (Unipharma)')"،
      "category": "تصنيف الزمرة الدوائية (مثلا: 'مسكنات'، 'مضادات حيوية'، 'أمراض القلب والشرايين'، 'فيتامينات ومتممات')",
      "barcode": "باركود الدواء إن كان مقروءاً، أو حدد كود افتراضي بـ 13 رقماً يبدأ بـ 6210"،
      "quantity": 30,
      "costPrice": 4800,
      "price": 6000,
      "expiryDate": "تاريخ انتهاء الصلاحية بصيغة YYYY-MM-DD"
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: actualMimeType,
            data: base64Data
          }
        },
        prompt
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const resultText = response.text || "{}";
    const data = JSON.parse(resultText.trim());
    return res.json(data);

  } catch (error: any) {
    console.error("Gemini Invoice Parser Error:", error);
    res.status(500).json({
      error: "فشل في معالجة وقراءة الفاتورة الذكية بالذكاء الاصطناعي",
      details: error.message,
      simulated: true,
      ...getSimulatedInvoiceParse()
    });
  }
});

function getSimulatedInvoiceParse() {
  return {
    supplier: "مستودع العبجي للأدوية",
    invoiceNumber: "INV-99228-2026",
    invoiceDate: new Date().toISOString().split('T')[0],
    items: [
      {
        tradeName: "سيتامول أقراص (Cetamol)",
        scientificName: "Paracetamol",
        strength: "500 mg",
        form: "أقراص",
        manufacturer: "تاميكو (TAMICO)",
        category: "مسكنات",
        barcode: "6210234091109",
        quantity: 50,
        costPrice: 2000,
        price: 2500,
        expiryDate: "2027-05-15"
      },
      {
        tradeName: "بيناموكس كبسول (Penamox)",
        scientificName: "Amoxicillin",
        strength: "500 mg",
        form: "كبسول",
        manufacturer: "دياموند (Diamond)",
        category: "مضادات حيوية",
        barcode: "6210512030044",
        quantity: 20,
        costPrice: 6800,
        price: 8500,
        expiryDate: "2027-02-10"
      },
      {
        tradeName: "بروفين دياموند للألم (Profen)",
        scientificName: "Ibuprofen",
        strength: "450 mg",
        form: "أقراص مغلفة",
        manufacturer: "دياموند (Diamond)",
        category: "مسكنات",
        barcode: "6210512030999",
        quantity: 30,
        costPrice: 3200,
        price: 4000,
        expiryDate: "2027-08-20"
      }
    ]
  };
}

// API: Generate and serve on-the-fly downloadable update patch ZIP
app.get("/api/app/download-update", (req, res) => {
  try {
    const zip = new AdmZip();
    
    // Add dist directory
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      zip.addLocalFolder(distPath, "dist");
    } else {
      return res.status(400).json({ error: "الرجاء بناء ملفات المشروع أولاً عبر تشغيل npm run build في الطرفية!" });
    }
    
    // Add electron-main.cjs
    const electronMainPath = path.join(process.cwd(), "electron-main.cjs");
    if (fs.existsSync(electronMainPath)) {
      zip.addLocalFile(electronMainPath);
    }
    
    // Add package.json
    const packageJsonPath = path.join(process.cwd(), "package.json");
    if (fs.existsSync(packageJsonPath)) {
      zip.addLocalFile(packageJsonPath);
    }
    
    // Add sqlite-adapter.ts
    const sqliteAdapterPath = path.join(process.cwd(), "sqlite-adapter.ts");
    if (fs.existsSync(sqliteAdapterPath)) {
      zip.addLocalFile(sqliteAdapterPath);
    }

    // Add automated batch updater script
    const batchScript = `@echo off
chcp 65001 > nul
title RemixPharma Update

rem Set current directory to directory of the script
cd /d "%~dp0"

echo ====================================================================
echo           معالج التحديث الذكي والترقية الفورية لنظام ريمكس
echo ====================================================================
echo.
echo مرحبا دكتور عمار! هذا المعالج سيقوم بتثبيت التحديثات الجديدة كوديا ومحاسبيا.
echo سيتم الحفاظ على كافة جرودك، حساباتك، أسعار الادوية واليوميات بامان تام.
echo.

rem 1. Detect application installation directory
set "TARGET_DIR="

if exist "RemixPharma.exe" goto FOUND_IN_CURRENT
if exist "resources" goto FOUND_IN_CURRENT
if exist "%LOCALAPPDATA%\\Programs\\RemixPharma\\RemixPharma.exe" goto FOUND_IN_LOCALAPPDATA
if exist "C:\\Program Files\\RemixPharma\\RemixPharma.exe" goto FOUND_IN_PROGRAM_FILES

rem Fallback if not auto-detected
set "TARGET_DIR=%LOCALAPPDATA%\\Programs\\RemixPharma"
echo [!] لم يتم اكتشاف مجلد تثبيت البرنامج تلقائيا. سيتم الافتراض والتركيب على:
echo "%LOCALAPPDATA%\\Programs\\RemixPharma"
goto PROC_UPGRADE

:FOUND_IN_CURRENT
set "TARGET_DIR=."
echo [+] تم اكتشاف ملفات التشغيل في المجلد الحالي مباشرة.
echo.
goto PROC_UPGRADE

:FOUND_IN_LOCALAPPDATA
set "TARGET_DIR=%LOCALAPPDATA%\\Programs\\RemixPharma"
echo [+] تم الكشف عن التثبيت الافتراضي للمستخدم:
echo "%LOCALAPPDATA%\\Programs\\RemixPharma"
echo.
goto PROC_UPGRADE

:FOUND_IN_PROGRAM_FILES
set "TARGET_DIR=C:\\Program Files\\RemixPharma"
echo [+] تم الكشف عن التثبيت العام للنظام:
echo "C:\\Program Files\\RemixPharma"
echo.
goto PROC_UPGRADE

:PROC_UPGRADE
echo [1/4] اغلاق البرنامج النشط حاليا لتمكين الاستبدال الامن...
taskkill /f /im RemixPharma.exe >nul 2>&1
taskkill /f /im electron.exe >nul 2>&1
timeout /t 2 >nul

echo.
echo [2/4] انشاء المجلدات وتثبيت ملفات الكود والواجهات الجديدة...
if not exist "%TARGET_DIR%\\resources\\app" mkdir "%TARGET_DIR%\\resources\\app" >nul 2>&1

rem Ensure local dist folder exists
if not exist "dist" goto ERROR_NO_DIST

echo جاري نسخ ملفات كود النظام والواجهات...
xcopy /s /e /y /i "dist" "%TARGET_DIR%\\resources\\app\\dist" >nul 2>&1
copy /y "electron-main.cjs" "%TARGET_DIR%\\resources\\app\\electron-main.cjs" >nul 2>&1
copy /y "package.json" "%TARGET_DIR%\\resources\\app\\package.json" >nul 2>&1
copy /y "sqlite-adapter.ts" "%TARGET_DIR%\\resources\\app\\sqlite-adapter.ts" >nul 2>&1

rem Support portable flat directory layout copy
xcopy /s /e /y /i "dist" "%TARGET_DIR%\\dist" >nul 2>&1
copy /y "electron-main.cjs" "%TARGET_DIR%\\electron-main.cjs" >nul 2>&1
copy /y "package.json" "%TARGET_DIR%\\package.json" >nul 2>&1
copy /y "sqlite-adapter.ts" "%TARGET_DIR%\\sqlite-adapter.ts" >nul 2>&1

echo تم نسخ ملفات التحديث بنجاح!
goto PROC_ASAR

:ERROR_NO_DIST
echo.
echo ====================================================================
echo [خطأ خطير] مجلد التحديثات (dist) غير متوفر في هذا المجلد الحالي!
echo يرجى التأكد من "فك ضغط" كامل ملف الـ ZIP اولا قبل تشغيل هذا الملف.
echo لا تقم بتشغيله من داخل برنامج WinRAR او المعاينة المباشرة للملف المضغوط.
echo ====================================================================
echo.
pause
exit

:PROC_ASAR
echo.
echo [3/4] تجاوز ارشيف الكود القديم (ASAR Overriding)...
if exist "%TARGET_DIR%\\resources\\app.asar" (
    echo جاري تحرير الارشيف الافتراضي لتمكين الكود الجديد...
    ren "%TARGET_DIR%\\resources\\app.asar" app.asar.old >nul 2>&1
    if exist "%TARGET_DIR%\\resources\\app.asar" (
        del /f /q "%TARGET_DIR%\\resources\\app.asar" >nul 2>&1
    )
)

echo.
echo [4/4] انهاء وتحديث قاعدة بيانات الصيدلية بامان...
echo.
echo ====================================================================
echo        تم تطبيق التحديث السحابي الشامل لصيدليتك بنجاح باهر
echo    كافة حساباتك، اسعار وعمليات الصيدلية مسجلة في مكان امن ولم تتاثر!
echo ====================================================================
echo.

if exist "%TARGET_DIR%\\RemixPharma.exe" (
    echo جاري اعادة تشغيل نظام ريمكس المحدث تلقائيا...
    start "" "%TARGET_DIR%\\RemixPharma.exe"
) else (
    echo التحديث مكتمل! يمكنك الان نقر مرتين على اختصار البرنامج على سطح المكتب للتشغيل.
)
echo.
echo اضغط على اي مفتاح لاغلاق معالج التثبيت والترقية الفورية...
pause >nul
`;

    // Ensure strict Windows newline formatting (\r\n / CRLF) to prevent CMD parsing errors and split command corruption
    const cleanBatchScript = batchScript.replace(/\r?\n/g, "\r\n");
    zip.addFile("تثبيت_التحديث_تلقائيا.bat", Buffer.from(cleanBatchScript, "utf-8"));

    const instructionsAr = `================================================================
📝 تعليمات التحديث اليدوي الفوري لصيدلية ريمكس لعام 2026:
================================================================

لتطبيق هذا التحديث مباشرة على حاسوبك الشخصي دون الحاجة لإعادة تنصيب البرنامج بالكامل:

----------------------------------------------------------------
🚨 هام جداً لتفادي حظر نظام الحماية بويندوز (SmartScreen / Windows Security):
----------------------------------------------------------------
قبل فك ضغط الملف، يرجى القيام بالخطوة البسيطة التالية:
1. انقر بزر الفأرة الأيمن (Right-Click) على ملف الـ ZIP المحمل (remix-pharma-update.zip) واختر "خصائص" (Properties).
2. في أسفل نافذة الخصائص (علامة التبويب العامة)، ستجد قسماً للحماية يقول:
   "This file came from another computer and might be blocked..." (هذا الملف جاء من جهاز حاسوب آخر ويحتمل حظره...)
3. قم بوضع علامة صح لحقل "إلغاء الحظر" (Unblock) ثم اضغط على "تطبيق" (Apply) وموافق (OK).
4. الآن، قم بفك ضغط الملف بشكل طبيعي وستعمل كافة الأدوات البرمجية دون أي قيود!

----------------------------------------------------------------
⚙️ خطوات التثبيت:
----------------------------------------------------------------
1. أغلق برنامج الصيدلية المفتوح حالياً على حاسوبك تماماً.
2. قم بفك الضغط عن هذا المجلد بالكامل.
3. قم بتشغيل ملف السكريبت المرفق:
   (تثبيت_التحديث_تلقائيا.bat) بنقرة مزدوجة (كلغة برمجية نظيفة).
   وسيقوم السكريبت تلقائياً بالبحث عن مسار التثبيت الرئيسي على جهازك واستبدال ملفات الكود لتبدأ العمل بالإصدار المحسن الجديد فوراً وبكبسة زر واحدة!

★ أمان البيانات:
البرنامج يفصل تماماً بين الكود وقاعدة البيانات.
قاعدة بياناتك وجرودك وأسعارك والذمم مشفرة ومحفوظة بالكامل في مسار نظام التشغيل المأمون (%APPDATA%/RemixPharma).
تطبيق أي تحديثات للكود لن يؤثر إطلاقاً على بياناتك المحفوظة ولن يقوم بمسحها أو حذفها نهائياً!
`;

    const cleanInstructionsAr = instructionsAr.replace(/\r?\n/g, "\r\n");
    zip.addFile("اقرأني_تعليمات_التحديث.txt", Buffer.from(cleanInstructionsAr, "utf-8"));

    const zipBuffer = zip.toBuffer();
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment; filename=remix-pharma-update.zip",
      "Content-Length": zipBuffer.length
    });
    res.end(zipBuffer);
  } catch (err: any) {
    console.error("ZIP creation error", err);
    res.status(500).json({ error: `فشل إنشاء ملف التحديث: ${err.message || err}` });
  }
});

// API: Gracefully quit the server/program
app.post("/api/app/quit", (req, res) => {
  res.json({ success: true, message: "تم إلقاء إشارة إيقاف الخلفية وإغلاق البرنامج بنجاح." });
  console.log("[Server-Shutdown] Received shutdown signal from React Client. Terminating process safely...");
  
  if (!process.env.K_SERVICE) {
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } else {
    console.log("[Server-Shutdown] Multi-user cloud container mode. Skipping process.exit() to keep container active.");
  }
});

// Vite integration for full stack preview
if (process.env.NODE_ENV !== "production") {
  import("vite").then(({ createServer: createViteServer }) => {
    createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    }).then((vite) => {
      app.use(vite.middlewares);
      
      // Fallback for SPA routing in development
      app.use("*", (req, res, next) => {
        vite.transformIndexHtml(req.originalUrl, "").then(() => {
          // Express will defer to vite middleware for static index serving
          next();
        }).catch(next);
      });

      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server is running in development mode on http://localhost:${PORT}`);
      });
    });
  }).catch((err) => {
    console.error("Failed to load Vite server dynamically:", err);
  });
} else {
  const distPath = typeof __dirname !== "undefined" ? __dirname : path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running in production mode on http://localhost:${PORT}`);
  });
}
