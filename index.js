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

// ฟังก์ชันซอยรูปภาพและบังคับให้ AI สรุปรายงานเป็นฟอร์มทางการที่คุณต้องการเป๊ะๆ
async function processBatchImages(client, userId, allImages) {
  try {
    const now = new Date();
    const yearBE = now.getFullYear() + 543;
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const thaiDateStr = `วันที่ ${now.getDate()} ${months[now.getMonth()]} พุทธศักราช ${yearBE}`;

    const imageChunks = [];
    for (let i = 0; i < allImages.length; i += 3) {
      imageChunks.push(allImages.slice(i, i + 3));
    }

    let extractedDataList = [];

    // ขั้นที่ 1: ให้ AI อ่านภาพแต่ละกลุ่มเพื่อดึง "ข้อมูลดิบ" ออกมาเงียบๆ (ห้ามทำตาราง)
    for (let index = 0; index < imageChunks.length; index++) {
      const chunk = imageChunks[index];
      
      const extractPrompt = `คุณคือระบบดึงข้อมูลภาพถ่ายหน้าจอสถานการณ์น้ำ หน้าที่ของคุณคือมองภาพแล้วจดบันทึกตัวเลขและชื่อสถานที่ที่ปรากฏในภาพออกมาเป็นข้อความสั้นๆ ตรงไปตรงมาที่สุด
- ห้ามสร้างตาราง
- ห้ามใส่ความคิดเห็น
- ดึงเฉพาะชื่อสถานี ตัวเลขฝนสะสม (มม.) ระดับน้ำ และชื่อจังหวัด/ลุ่มน้ำที่เห็นจริงในภาพเท่านั้น`;

      const contentPayload = [{ type: "text", text: extractPrompt }];
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
      const rawText = data.choices?.[0]?.message?.content;
      if (rawText) {
        extractedDataList.push(rawText);
      }
    }

    const allRawData = extractedDataList.join("\n---\n");

    // ขั้นที่ 2: บังคับ AI ตัวสุดท้ายให้เขียนรายงานตามฟอร์มที่คุณต้องการแบบเป๊ะๆ ห้ามออกนอกลู่นอกทาง
    const finalReportPrompt = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมทรัพยากรน้ำ นำข้อมูลดิบที่สกัดได้จากภาพถ่ายด้านล่างนี้ มาเรียบเรียงเป็นรายงานทางการ **ตามรูปแบบตัวอย่างที่กำหนดให้ด้านล่างนี้อย่างเคร่งครัดที่สุด** ห้ามสร้างตาราง ห้ามใส่ข้อมูลอื่นนอกเหนือจากข้อมูลดิบนี้

ข้อมูลดิบจากภาพถ่าย:
${allRawData}

รูปแบบรายงานที่ต้องใช้ (ให้แทนที่ข้อความในวงเล็บ [...] ด้วยข้อมูลจริงจากภาพดิบ โดยใช้วันที่ ${thaiDateStr}):

✅ อัปเดตรายงานสถานการณ์น้ำสำเร็จ

${thaiDateStr} รายงานสถานการณ์น้ำแบบเรียลไทม์และการคาดการณ์ล่วงหน้าสามวัน ครอบคลุมลุ่มน้ำสำคัญจากข้อมูลที่แนบมา พบว่าปริมาณฝนสะสมทั่วทั้งภูมิภาคมีค่าเฉลี่ยในเกณฑ์ [ระบุลักษณะฝนตามจริง เช่น ปานกลางถึงหนัก] โดยมีจุดที่ตั้งวัดปริมาณฝนสูงสุดได้ที่ [ระบุชื่อสถานี/อำเภอ/จังหวัด และตัวเลข มม. สูงสุดจากภาพ] ทั้งนี้ การคาดการณ์ล่วงหน้าสามวันข้างหน้า ปริมาณฝนสะสมในภาพรวมมีแนวโน้ม [ระบุแนวโน้มตามจริงจากภาพ]

ด้านสถานการณ์ระดับน้ำในลำน้ำและการคาดการณ์ล่วงหน้าสามวัน (อิงข้อมูลจากภาพถ่ายที่แนบมา): 
* **ระดับน้ำและระดับตลิ่ง:** สถานการณ์ระดับน้ำปัจจุบัน [สรุปข้อมูลระดับน้ำ/ตลิ่ง หรือจุดที่สูง/ต่ำกว่าตลิ่งจากข้อมูลดิบเท่าที่มีในภาพ]
* **ความจุลำน้ำ:** [สรุปข้อมูลความจุลำน้ำตามที่มีในภาพ หรือระบุภาพรวมตามข้อมูลจริง]
* **แนวโน้มระดับน้ำและการคาดการณ์:** จากสถิติระดับน้ำและข้อมูลในภาพพบว่าแนวโน้มระดับน้ำ [สรุปทิศทางตามข้อมูลในภาพ]

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
    const finalReport = finalData.choices?.[0]?.message?.content || "⚠ ไม่สามารถสร้างรายงานได้";

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
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});