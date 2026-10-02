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

app.post('/webhook', line.middleware(lineConfig), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'image') {
    return Promise.resolve(null);
  }

  const client = new line.Client(lineConfig);
  const replyToken = event.replyToken;
  const messageId = event.message.id;

  try {
    await client.replyMessage(replyToken, {
      type: 'text',
      text: '🔄 ระบบกำลังส่งภาพให้ AI วิเคราะห์สถานการณ์น้ำ กรุณารอสักครู่...'
    });

    const stream = await client.getMessageContent(messageId);
    let chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const base64Image = buffer.toString('base64');

    const now = new Date();
    const yearBE = now.getFullYear() + 543;
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const thaiDateStr = `วันที่ ${now.getDate()} ${months[now.getMonth()]} พ.ศ. ${yearBE}`;

    const systemPrompt = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมทรัพยากรน้ำและอุทกวิทยา หน้าที่ของคุณคือนำภาพถ่ายหน้าจอข้อมูลสถานการณ์น้ำที่ส่งมา มาวิเคราะห์และเรียบเรียงเป็นรายงานสถานการณ์น้ำอย่างเป็นทางการ

กฎสำคัญ:
1. ระบุวันที่ในรายงานคือ ${thaiDateStr} เป็นภาษาไทยทั้งหมด
2. ใช้ภาษาไทยที่เป็นทางการ สละสลวย จัดรูปแบบหัวข้อและย่อหน้าให้อ่านง่าย
3. สรุปภาพรวมระดับน้ำ ปริมาณฝน และแนวโน้มตามข้อมูลในภาพ

ใช้โครงสร้างรายงานตามรูปแบบนี้:
${thaiDateStr} สรุปภาพรวมสถานการณ์น้ำและปริมาณฝนในพื้นที่จากภาพถ่ายหน้าจอที่รวบรวมจากระบบอุทกวิทยา

* สถานการณ์ระดับน้ำและจุดที่ล้นตลิ่ง: [วิเคราะห์จากภาพ]
* ปริมาณฝนสะสม 24 ชั่วโมง: [วิเคราะห์จากภาพ]
* แนวโน้มระดับน้ำและการคาดการณ์: ทรงตัวและเฝ้าระวังอย่างใกล้ชิด`;

    // เรียกใช้งาน Groq API (รองรับโมเดลวิสัยทัศน์เช่น llama-3.2-11b-vision-preview)
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.2-11b-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: systemPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        temperature: 0.3
      })
    });

    const groqData = await groqResponse.json();
    console.log("Groq Response:", JSON.stringify(groqData));

    const aiReport = groqData.choices?.[0]?.message?.content || "⚠ ไม่สามารถวิเคราะห์ข้อมูลจากภาพได้";

    await client.pushMessage(event.source.userId, {
      type: 'text',
      text: aiReport
    });

  } catch (error) {
    console.error("Error processing image with Groq:", error);
    await client.pushMessage(event.source.userId, {
      type: 'text',
      text: '⚠ เกิดข้อผิดพลาดในการประมวลผลภาพถ่าย กรุณาลองส่งใหม่อีกครั้ง'
    });
  }
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});