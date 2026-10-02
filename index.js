const express = require('express');
const line = require('@line/bot-sdk');
const fetch = require('node-fetch');

const lineConfig = {
  channelAccessToken: "pikOSiC2zLbWGKEgVC4V+mdBd90Ly8wXYy4lNtzwvDJaFBCCaxJ3pP2Baz9URzpZ4xLQ3slkGEdkdVCxRQcB6/OjWrbNlrnjp5cgwECvjgjyUtA9nyIzoRuj62AS2ljDQ3Kun5Oo8NYKjamuei1OrAdB04t89/1O/w1cDnyilFU=",
  channelSecret: "8799e485fb872e777415e818f303c5cf"
};

// ⚠️ ใส่ API Key ของ Groq ตรงนี้ (ขึ้นต้นด้วย gsk_...)
const GROQ_API_KEY = "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";

const app = express();

// ตัวแปรเก็บภาพชั่วคราวแยกตาม User เพื่อรอรวมร่าง (Batching)
const userImageBuffers = {};
const userTimeouts = {};

app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  res.status(200).end(); // ตอบรับ LINE Server ก่อนทันทีเพื่อป้องกัน Timeout

  req.body.events.forEach(async (event) => {
    if (event.type === 'message' && event.message.type === 'image') {
      const userId = event.source.userId;
      const messageId = event.message.id;

      const client = new line.Client(lineConfig);

      try {
        // ดาวน์โหลดรูปภาพแปลงเป็น Base64
        const stream = await client.getMessageContent(messageId);
        let chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const base64Image = buffer.toString('base64');

        // ถ้ายังไม่มีอาเรย์ของ User นี้ ให้สร้างขึ้นมา
        if (!userImageBuffers[userId]) {
          userImageBuffers[userId] = [];
        }

        // เก็บภาพลงกองกลางของ User นี้
        userImageBuffers[userId].push(base64Image);

        // แจ้งเตือนรอบแรกครั้งเดียวว่ากำลังรอรับรูปให้ครบ
        if (userImageBuffers[userId].length === 1) {
          await client.pushMessage(userId, {
            type: 'text',
            text: '🔄 ระบบกำลังรวบรวมภาพถ่ายที่คุณส่งมาทั้งหมด กรุณารอสักครู่...'
          });
        }

        // เคลียร์ Timer เก่า และตั้งเวลาใหม่ (หน่วง 5 วินาทีเผื่อส่งหลายรูป)
        if (userTimeouts[userId]) {
          clearTimeout(userTimeouts[userId]);
        }

        userTimeouts[userId] = setTimeout(async () => {
          const imagesToProcess = userImageBuffers[userId];
          delete userImageBuffers[userId];
          delete userTimeouts[userId];

          await processAndReplyImages(client, userId, imagesToProcess);
        }, 5000); // รอ 5 วินาทีหลังจากรูปสุดท้ายถูกส่งเข้ามา

      } catch (err) {
        console.error("Error downloading image:", err);
      }
    }
  });
});

// ฟังก์ชันส่งภาพทั้งหมดไปให้ AI วิเคราะห์รวบยอดทีเดียว
async function processAndReplyImages(client, userId, base64Images) {
  try {
    const now = new Date();
    const yearBE = now.getFullYear() + 543;
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const thaiDateStr = `วันที่ ${now.getDate()} ${months[now.getMonth()]} พ.ศ. ${yearBE}`;

    const systemPrompt = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมทรัพยากรน้ำและอุทกวิทยา หน้าที่ของคุณคือนำ "ภาพถ่ายหน้าจอข้อมูลสถานการณ์น้ำทั้งหมด ${base64Images.length} ภาพที่แนบมานี้" มาวิเคราะห์รวมกันเป็นรายงานฉบับเดียว

⚠️ **กฎเหล็กสำคัญที่สุด (ห้ามฝ่าฝืนเด็ดขาด):**
1. **ห้ามแต่งเติมหรือกุตัวเลขขึ้นมาเองเด็ดขาด:** ต้องดึงเฉพาะชื่อสถานี ตัวเลขระดับน้ำ ระดับตลิ่ง และปริมาณฝน (มม.) ที่ปรากฏอยู่จริงในภาพถ่ายทุกภาพเท่านั้น หากภาพไหนไม่มีข้อมูลตัวเลข ห้ามคาดเดา
2. ระบุวันที่ในรายงานคือ **${thaiDateStr}** เป็นภาษาไทยทั้งหมด
3. ใช้ภาษาไทยที่เป็นทางการ สละสลวย จัดรูปแบบหัวข้อและย่อหน้าให้อ่านง่ายเป็นระเบียบ

ใช้โครงสร้างรายงานตามรูปแบบนี้:
${thaiDateStr} สรุปภาพรวมสถานการณ์น้ำและปริมาณฝนในพื้นที่ (อจากภาพถ่ายหน้าจอ ${base64Images.length} ภาพที่รวบรวมได้)

* **สถานการณ์ระดับน้ำและจุดที่ล้นตลิ่ง:**
  * [ดึงชื่อสถานีและตัวเลขระดับน้ำจริงจากในภาพมาสรุป]
* **ปริมาณฝนสะสม 24 ชั่วโมง:**
  * [ดึงตัวเลขปริมาณฝนจริงจากในภาพมาสรุป]
* **แนวโน้มระดับน้ำและการคาดการณ์:**
  * ระดับน้ำในภาพรวมและแนวโน้มการเปลี่ยนแปลง

บทสรุปการบริหารจัดการน้ำและแนวทางการปฏิบัติงาน:
ข้อเสนอแนะและแนวทางปฏิบัติสำหรับเจ้าหน้าที่ในการเฝ้าระวังจุดเสี่ยงจากข้อมูลในภาพ`;

    // เตรียมโครงสร้าง Multimodal ส่งหลายรูปพร้อมกันให้ Groq (หรือ OpenAI Compatible)
    const contentPayload = [{ type: "text", text: systemPrompt }];
    
    base64Images.forEach((imgBase64) => {
      contentPayload.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${imgBase64}`
        }
      });
    });

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.2-90b-vision-preview", // ใช้รุ่นใหญ่ 90B Vision ที่รองรับหลายรูปและวิเคราะห์แม่นยำสูง
        messages: [{ role: "user", content: contentPayload }],
        temperature: 0.1 // ตั้งค่าต่ำสุดเพื่อลดการคิดเลขมั่วหรือแต่งเติมข้อความ
      })
    });

    const data = await response.json();
    console.log("Groq Batch Response:", JSON.stringify(data));

    const aiReport = data.choices?.[0]?.message?.content || "⚠ ไม่สามารถวิเคราะห์ข้อมูลจากภาพได้";

    await client.pushMessage(userId, {
      type: 'text',
      text: aiReport
    });

  } catch (error) {
    console.error("Error in batch processing:", error);
    await client.pushMessage(userId, {
      type: 'text',
      text: '⚠ เกิดข้อผิดพลาดในการประมวลผลชุดภาพถ่าย กรุณาลองใหม่อีกครั้ง'
    });
  }
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});