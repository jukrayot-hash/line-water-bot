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

// ฟังก์ชันซอยรูปภาพออกเป็นกลุ่มละ 3 รูป แล้วส่งประมวลผล (ปรับสำนวนรายงานให้เป็นทางการและกระชับ)
async function processBatchImages(client, userId, allImages) {
  try {
    const now = new Date();
    const yearBE = now.getFullYear() + 543;
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    // แปลงปีเป็นคำเต็ม "พุทธศักราช 2569" ตามตัวอย่าง
    const thaiDateStr = `วันที่ ${now.getDate()} ${months[now.getMonth()]} พุทธศักราช ${yearBE}`;

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
3. หากในภาพระบุลุ่มน้ำ (เช่น ลุ่มน้ำบางปะกง ภาคตะวันออก หรืออื่นๆ) ให้ระบุให้ชัดเจนตามภาพ

จดบันทึกตัวเลขและข้อมูลดิบสำคัญที่พบในภาพชุดนี้ตามจริง:`;

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
          temperature: 0.0
        })
      });

      const data = await response.json();
      const reportPart = data.choices?.[0]?.message?.content;
      if (reportPart) {
        partialReports.push(reportPart);
      }
    }

    const combinedContent = partialReports.join("\n\n");

    // ขั้นที่ 2: จัดเรียงรายงานตามรูปแบบทางการที่คุณต้องการ
    const finalReportPrompt = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมทรัพยากรน้ำและอุทกวิทยา นำข้อมูลดิบที่สกัดได้จากภาพถ่ายจริงด้านล่างนี้ มาเรียบเรียงเป็นรายงานสถานการณ์น้ำอย่างเป็นทางการ

⚠️ **กฎเหล็กเคร่งครัด:**
- ใช้รูปแบบสำนวนภาษาไทยที่เป็นทางการ สละสลวย เหมือนตัวอย่างรายงานราชการ/วิศวกรรม
- ระบุวันที่ในรายงานคือ **${thaiDateStr}** เท่านั้น
- ห้ามมีคำภาษาอังกฤษปะปน ใช้คำว่า "พุทธศักราช" เต็ม
- **เน้นสรุปเฉพาะจุดหลักๆ สำคัญ** (เช่น ภาพรวมลุ่มน้ำ จุดที่ฝนสูงสุด จุดที่ล้นตลิ่ง และแนวโน้ม 3 วัน) ไม่ต้องแจกแจงรายสถานีละเอียดยิบย่อยทุกจุด
- ห้ามแต่งเติมข้อมูลหรือตัวเลขใดๆ ที่นอกเหนือจากข้อมูลดิบด้านล่างนี้เด็ดขาด

ข้อมูลดิบที่อ่านได้จากภาพถ่าย:
${combinedContent}

กรุณาเรียบเรียงรายงานตามโครงสร้างนี้:

✅ อัปเดตรายงานสถานการณ์น้ำสำเร็จ

${thaiDateStr} รายงานสถานการณ์น้ำแบบเรียลไทม์และการคาดการณ์ล่วงหน้าสามวัน ครอบคลุมลุ่มน้ำสำคัญจากข้อมูลที่แนบมา พบว่า... [สรุปภาพรวมปริมาณฝนสะสม ลักษณะฝน และจุดที่วัดปริมาณฝนสูงสุด พร้อมตัวเลขจริงจากภาพ] ทั้งนี้ การคาดการณ์ล่วงหน้าสามวันข้างหน้า... [สรุปแนวโน้มฝนคาดการณ์ 3 วันตามข้อมูลในภาพ]

ด้านสถานการณ์ระดับน้ำในลำน้ำและการคาดการณ์ล่วงหน้าสามวัน (อิงข้อมูลจากภาพถ่ายที่แนบมา): 
* **ระดับน้ำและระดับตลิ่ง:** [สรุปเฉพาะสถานีหลักที่มีความสำคัญหรือจุดที่ล้นตลิ่ง/ใกล้ล้นตลิ่ง พร้อมตัวเลขอ้างอิงจริงตามภาพ และแนวโน้มในอีก 3 วันข้างหน้า]
* **ความจุลำน้ำ (ถ้ามีในภาพ):** [สรุปภาพรวมความจุลำน้ำสายหลักตามข้อมูลจริง]
* **แนวโน้มระดับน้ำและการคาดการณ์:** [สรุปภาพรวมแนวโน้มระดับน้ำย้อนหลังและทิศทางใน 3 วันข้างหน้า]

ทั้งนี้ หน่วยงานที่เกี่ยวข้องและเจ้าหน้าที่ผู้ปฏิบัติงานในพื้นที่ ได้ติดตามสถานการณ์น้ำและปริมาณฝนสะสมอย่างใกล้ชิด พร้อมทั้งตรวจสอบความพร้อมของเครื่องมือ อุปกรณ์ระบายน้ำ และระบบเตือนภัยให้พร้อมใช้งาน เพื่อให้สามารถบริหารจัดการน้ำและแจ้งเตือนประชาชนในพื้นที่เสี่ยงภัยได้อย่างทันท่วงที`;

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
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});