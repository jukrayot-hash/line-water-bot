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
  res.status(200).end(); // ตอบรับ LINE Server ทันทีเพื่อป้องกัน Timeout

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

        // เก็บภาพลงกองกลาง (รองรับสูงสุด 10 ภาพ)
        userImageBuffers[userId].push(base64Image);
        if (userImageBuffers[userId].length > 10) {
          userImageBuffers[userId] = userImageBuffers[userId].slice(-10);
        }

        if (userImageBuffers[userId].length === 1) {
          await client.pushMessage(userId, {
            type: 'text',
            text: '🔄 ระบบกำลังรวบรวมภาพถ่ายของคุณ (รองรับสูงสุด 10 ภาพ) กรุณารอสักครู่...'
          });
        }

        if (userTimeouts[userId]) {
          clearTimeout(userTimeouts[userId]);
        }

        // รอ 5 วินาทีหลังจากส่งรูปสุดท้ายครบ
        userTimeouts[userId] = setTimeout(async () => {
          const imagesToProcess = userImageBuffers[userId];
          delete userImageBuffers[userId];
          delete userTimeouts[userId];

          await processBatchImages(client, userId, imagesToProcess);
        }, 5000);

      } catch (err) {
        console.error("Error downloading image:", err);
      }
    }
  });
});

// ฟังก์ชันซอยรูปภาพออกเป็นกลุ่มละ 3 รูป แล้วส่งประมวลผล (ตามหัวข้อที่กำหนดอย่างเคร่งครัด)
async function processBatchImages(client, userId, allImages) {
  try {
    const now = new Date();
    const yearBE = now.getFullYear() + 543;
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const thaiDateStr = `วันที่ ${now.getDate()} ${months[now.getMonth()]} พ.ศ. ${yearBE}`;

    const imageChunks = [];
    for (let i = 0; i < allImages.length; i += 3) {
      imageChunks.push(allImages.slice(i, i + 3));
    }

    let partialReports = [];

    // ขั้นที่ 1: สกัดข้อมูลดิบจากภาพแบบเข้มงวด ห้ามมั่ว
    for (let index = 0; index < imageChunks.length; index++) {
      const chunk = imageChunks[index];
      
      const chunkPrompt = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมทรัพยากรน้ำ หน้าที่ของคุณคืออ่านข้อมูลจาก "ภาพถ่ายหน้าจอ" ที่แนบมานี้เท่านั้น

🚨 **กฎเหล็กเพื่อป้องกันการมั่วข้อมูล (Strict Rules):**
1. ห้ามแต่งเติมหรือกุตัวเลข/ชื่อสถานีขึ้นมาเองเด็ดขาด 
2. ดึงเฉพาะชื่อสถานี ตัวเลขระดับน้ำ ระดับตลิ่ง ปริมาณฝน (มม.) และสภาพฝนที่ปรากฏอยู่จริงในภาพถ่ายเท่านั้น
3. หากในภาพระบุลุ่มน้ำ (เช่น ลุ่มน้ำภาคตะวันออก / บางปะกง) ให้ระบุให้ชัดเจนตามภาพ

จดบันทึกตัวเลขและข้อมูลดิบทั้งหมดที่พบในภาพชุดนี้ตามจริง:`;

      const contentPayload = [{ type: "text", text: chunkPrompt }];
      chunk.forEach((imgBase64) => {
        contentPayload.push({
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${imgBase64}` }
        });
      });

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "qwen/qwen3.8-27b",
          messages: [{ role: "user", content: contentPayload }],
          temperature: 0.0 // ล็อกค่าความแม่นยำ ห้ามจินตนาการ
        })
      });

      const data = await response.json();
      const reportPart = data.choices?.[0]?.message?.content;
      if (reportPart) {
        partialReports.push(reportPart);
      }
    }

    const combinedContent = partialReports.join("\n\n");

    // ขั้นที่ 2: จัดเรียงรายงานตาม 3 หัวข้อที่คุณต้องการเป๊ะๆ
    const finalReportPrompt = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมทรัพยากรน้ำและอุทกวิทยา นำข้อมูลดิบที่สกัดได้จากภาพถ่ายจริงด้านล่างนี้ มาเรียบเรียงเป็นรายงานสถานการณ์น้ำอย่างละเอียด

⚠️ **กฎเหล็กเคร่งครัด:**
- ห้ามมีคำภาษาอังกฤษปะปน ใช้คำว่า "พ.ศ." แทนปี ค.ศ.
- ห้ามแต่งเติมข้อมูลหรือตัวเลขใดๆ ที่นอกเหนือจากข้อมูลดิบด้านล่างนี้เด็ดขาด

ข้อมูลดิบที่อ่านได้จากภาพถ่าย:
${combinedContent}

กรุณาเรียบเรียงรายงานตามโครงสร้างและหัวข้อทั้ง 3 นี้อย่างเคร่งครัด:

${thaiDateStr} สรุปภาพรวมสถานการณ์น้ำและปริมาณฝนในพื้นที่จากภาพถ่ายหน้าจอระบบอุทกวิทยา

1. สถานการณ์ฝนของลุ่มน้ำภาคตะวันออก (อิงจากข้อมูลในภาพ):
   * ลักษณะฝนที่ตกในพื้นที่ (น้อย / ปานกลาง / หนัก / หนักมาก)
   * จุดที่วัดปริมาณฝนได้มากที่สุดคือที่ใด พร้อมระบุตัวเลข (มม.) ตามจริงจากภาพ

2. สถานการณ์น้ำล้นตลิ่ง (อิงจากข้อมูลในภาพ):
   * ระบุพื้นที่หรือสถานีที่มีน้ำล้นตลิ่ง (หรือใกล้ล้นตลิ่ง) พร้อมระบุตัวเลขอ้างอิงว่าล้นหรือต่ำกว่าตลิ่งเท่าไรตามจริง
   * สรุปสถานการณ์และแนวโน้มในแม่น้ำสายหลักจากภาพ

3. สถานการณ์ฝนคาดการณ์และการคาดการณ์ล่วงหน้า 3 วัน (อิงจาก Thaiwater / สสน. ในภาพ):
   * แนวโน้มปริมาณฝนและการคาดการณ์ล่วงหน้า 3 วัน
   * แนวโน้มระดับน้ำในแม่น้ำหลักตามข้อมูลในระบบ

บทสรุปการบริหารจัดการน้ำและแนวทางการปฏิบัติงาน:
ข้อเสนอแนะและแนวทางปฏิบัติสำหรับเจ้าหน้าที่ในการเฝ้าระวังจุดเสี่ยงจากข้อมูลจริงในภาพ`;

    const finalResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [{ role: "user", content: finalReportPrompt }],
        temperature: 0.0
      })
    });

    const finalData = await finalResponse.json();
    const finalReport = finalData.choices?.[0]?.message?.content || combinedContent;

    await client.pushMessage(userId, {
      type: 'text',
      text: finalReport
    });

  } catch (error) {
    console.error("Error in batch processing:", error);
    await client.pushMessage(userId, {
      type: 'text',
      text: '⚠ เกิดข้อผิดพลาดในการประมวลผลชุดภาพถ่าย กรุณาลองส่งใหม่อีกครั้ง'
    });
  }
}const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});