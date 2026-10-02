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

const userImageBuffers = {};
const userTimeouts = {};

app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  res.status(200).end();

  req.body.events.forEach(async (event) => {
    if (event.type === 'message' && event.message.type === 'image') {
      const userId = event.source.userId;
      const messageId = event.message.id;

      const client = new line.Client(lineConfig);

      try {
        const stream = await client.getMessageContent(messageId);
        let chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const base64Image = buffer.toString('base64');

        if (!userImageBuffers[userId]) {
          userImageBuffers[userId] = [];
        }

        userImageBuffers[userId].push(base64Image);

        if (userImageBuffers[userId].length === 1) {
          await client.pushMessage(userId, {
            type: 'text',
            text: '🔄 ระบบกำลังรวบรวมภาพถ่ายที่คุณส่งมาทั้งหมด กรุณารอสักครู่...'
          });
        }

        if (userTimeouts[userId]) {
          clearTimeout(userTimeouts[userId]);
        }

        userTimeouts[userId] = setTimeout(async () => {
          const imagesToProcess = userImageBuffers[userId];
          delete userImageBuffers[userId];
          delete userTimeouts[userId];

          await processAndReplyImages(client, userId, imagesToProcess);
        }, 5000);

      } catch (err) {
        console.error("Error downloading image:", err);
      }
    }
  });
});

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
${thaiDateStr} สรุปภาพรวมสถานการณ์น้ำและปริมาณฝนในพื้นที่ (อิงจากภาพถ่ายหน้าจอ ${base64Images.length} ภาพที่รวบรวมได้)

* **สถานการณ์ระดับน้ำและจุดที่ล้นตลิ่ง:**
  * [ดึงชื่อสถานีและตัวเลขระดับน้ำจริงจากในภาพมาสรุป]
* **ปริมาณฝนสะสม 24 ชั่วโมง:**
  * [ดึงตัวเลขปริมาณฝนจริงจากในภาพมาสรุป]
* **แนวโน้มระดับน้ำและการคาดการณ์:**
  * ระดับน้ำในภาพรวมและแนวโน้มการเปลี่ยนแปลง

บทสรุปการบริหารจัดการน้ำและแนวทางการปฏิบัติงาน:
ข้อเสนอแนะและแนวทางปฏิบัติสำหรับเจ้าหน้าที่ในการเฝ้าระวังจุดเสี่ยงจากข้อมูลในภาพ`;

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
        model: "qwen/qwen3.8-27b", // ใช้โมเดลปัจจุบันที่รองรับวิสัยทัศน์
        messages: [{ role: "user", content: contentPayload }],
        temperature: 0.1
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
      text: '⚠ เกิดข้อผิดพลาดในการประมวลผลชุดภาพถ่าย กรุณาลองส่งใหม่อีกครั้ง'
    });
  }
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});