// معالج إعداد البوت وحالة البوتات
const axios = require('axios');

// نظام تخزين مؤقت بسيط للبوتات
const botStore = {};

// دالة لتخزين معلومات البوت
function saveBot(botId, data) {
  botStore[botId] = {
    ...data,
    createdAt: Date.now()
  };
  return botId;
}

// دالة للحصول على معلومات البوت
function getBot(botId) {
  return botStore[botId] || null;
}

// دالة للتحقق من وجود البوت
function botExists(botId) {
  return !!botStore[botId];
}

// دالة لحذف البوت
function deleteBot(botId) {
  if (botStore[botId]) {
    delete botStore[botId];
    return true;
  }
  return false;
}

// دالة للحصول على جميع البوتات
function getAllBots() {
  return Object.keys(botStore).map(botId => ({
    id: botId,
    ...botStore[botId]
  }));
}

// تنظيف البوتات القديمة
setInterval(() => {
  const now = Date.now();
  const expiryTime = 24 * 60 * 60 * 1000; // 24 ساعة
  
  Object.keys(botStore).forEach(botId => {
    const bot = botStore[botId];
    if (now - bot.createdAt > expiryTime) {
      delete botStore[botId];
    }
  });
}, 60 * 60 * 1000); // تنظيف كل ساعة

// معالج الطلبات
module.exports = async (req, res) => {
  // السماح بطلبات CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // التعامل مع طلبات OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // الحصول على حالة البوت
  if (req.method === 'GET') {
    try {
      const botId = req.query.botId;
      
      // إذا تم تحديد معرف بوت، أعد معلومات هذا البوت فقط
      if (botId) {
        const bot = getBot(botId);
        if (!bot) {
          return res.status(404).json({ error: 'Bot not found' });
        }
        
        // إعادة نسخة من البوت بدون البيانات الحساسة
        const safeBotInfo = {
          id: botId,
          botInfo: bot.botInfo,
          createdAt: bot.createdAt
        };
        
        return res.status(200).json(safeBotInfo);
      }
      
      // إذا لم يتم تحديد معرف، أعد قائمة بجميع البوتات
      const allBots = getAllBots().map(bot => ({
        id: bot.id,
        botInfo: bot.botInfo,
        createdAt: bot.createdAt
      }));
      
      return res.status(200).json({ bots: allBots });
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
  
  // حذف البوت
  if (req.method === 'DELETE') {
    try {
      const botId = req.query.botId;
      if (!botId) {
        return res.status(400).json({ error: 'Bot ID is required' });
      }
      
      const bot = getBot(botId);
      if (!bot) {
        return res.status(404).json({ error: 'Bot not found' });
      }
      
      // إلغاء تسجيل الويبهوك
      try {
        await axios.post(`https://api.telegram.org/bot${bot.telegramToken}/deleteWebhook`);
      } catch (error) {
        console.error('Error deleting webhook:', error);
      }
      
      // حذف البوت من التخزين
      deleteBot(botId);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
  
  // إنشاء بوت جديد
  if (req.method === 'POST') {
    try {
      // استخراج معلومات البوت
      const { telegramToken, geminiToken, systemInstruction } = req.body;
      
      if (!telegramToken || !geminiToken) {
        return res.status(400).json({ error: 'Telegram token and Gemini token are required' });
      }

      // التحقق من صحة توكن تليجرام
      try {
        const telegramResponse = await axios.get(`https://api.telegram.org/bot${telegramToken}/getMe`);
        
        if (!telegramResponse.data.ok) {
          return res.status(400).json({ error: 'Invalid Telegram token' });
        }
        
        const botInfo = telegramResponse.data.result;
        
        // إنشاء معرف فريد للبوت
        const botId = Date.now().toString();
        
        // حفظ معلومات البوت
        saveBot(botId, {
          telegramToken,
          geminiToken,
          systemInstruction: systemInstruction || 'أنت مساعد مفيد.',
          botInfo
        });
        
        // إعداد الويبهوك
        const webhookUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/webhook?botId=${botId}`;
        
        await axios.post(`https://api.telegram.org/bot${telegramToken}/setWebhook`, {
          url: webhookUrl,
          allowed_updates: ["message", "edited_message", "callback_query"]
        });
        
        return res.status(200).json({
          success: true,
          botId,
          botInfo,
          webhookUrl
        });
      } catch (error) {
        return res.status(400).json({ 
          error: 'Invalid Telegram token or connection error',
          details: error.message
        });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};

// تصدير نظام التخزين للاستخدام في ملفات أخرى
module.exports.botStore = botStore;