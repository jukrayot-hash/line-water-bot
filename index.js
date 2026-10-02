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

// ฟังก์ชันประมวลผลภาพถ่าย ดึงตัวเลขและชื่อลุ่มน้ำจริงมาใส่ในรายงานทางการ
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

    // ขั้นที่ 1: ดึงเฉพาะชื่อลุ่มน้ำ/สถานีที่มีฝนสูงสุด และตัวเลขปริมาณฝน (มม.) ที่เห็นจริงจากภาพ
    for (let index = 0; index < imageChunks.length; index++) {
      const chunk = imageChunks[index];
      
      const extractPrompt = `คุณคือระบบวิเคราะห์ภาพถ่ายอุทกวิทยา จงมองหาและดึงข้อมูลเฉพาะจุดที่ฝนสะสมสูงสุดในภาพ ดังนี้:
1. ชื่อลุ่มน้ำ หรือชื่ออำเภอ/จังหวัดที่พบในภาพ
2. ตัวเลขปริมาณฝนสะสมสูงสุด (มม.) ที่อ่านได้จากภาพ
เขียนตอบสั้นๆ เช่น "ลุ่มน้ำ... บริเวณ... ปริมาณฝนสะสม ... มม." ห้ามแต่งข้อมูลเองเด็ดขาด`;

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

    const allRawData = extractedDataList.join("\n");

    if (!allRawData.trim()) {
      await client.pushMessage(userId, {
        type: 'text',
        text: '⚠ ไม่สามารถอ่านข้อมูลจากรูปภาพที่ส่งมาได้ กรุณาตรวจสอบความชัดเจนของรูปภาพแล้วลองใหม่อีกครั้ง'
      });
      return;
    }

    // ขั้นที่ 2: นำข้อมูลจริงที่สกัดได้ มาใส่แทนที่คำกว้างๆ ในฟอร์มทางการ
    const finalReportPrompt = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมทรัพยากรน้ำ นำข้อมูลสรุปจากภาพด้านล่างนี้ มาเรียบเรียงเป็นรายงานทางการ โดยต้อง **นำชื่อลุ่มน้ำ/สถานี และตัวเลขปริมาณฝนสูงสุดที่อ่านได้จริงมาใส่แทนที่คำกว้างๆ** ห้ามสร้างตาราง ห้ามพ่นลิสต์ยาว:

ข้อมูลจริงที่สกัดได้จากภาพ:
${allRawData}

จงเขียนรายงานตามรูปแบบนี้เท่านั้น:

✅ อัปเดตรายงานสถานการณ์น้ำสำเร็จ

${thaiDateStr} รายงานสถานการณ์น้ำแบบเรียลไทม์และการคาดการณ์ล่วงหน้าสามวัน ครอบคลุมลุ่มน้ำสำคัญ พบว่าปริมาณฝนสะสมทั่วทั้งภูมิภาคมีค่าเฉลี่ยในเกณฑ์ปานกลางถึงหนัก โดยมีจุดที่วัดปริมาณฝนสะสมสูงสุดจากภาพคือ [นำชื่อลุ่มน้ำ/พื้นที่และตัวเลข มม. ที่สกัดได้มาใส่ตรงนี้] ทั้งนี้ การคาดการณ์ล่วงหน้าสามวันข้างหน้า ปริมาณฝนสะสมในภาพรวมมีแนวโน้มลดลงอย่างต่อเนื่อง

ด้านสถานการณ์ระดับน้ำในลำน้ำและการคาดการณ์ล่วงหน้าสามวัน (อิงข้อมูลจากภาพถ่ายที่แนบมา): 
* **ระดับน้ำและระดับตลิ่ง:** สถานการณ์ระดับน้ำปัจจุบันสอดคล้องกับข้อมูลพื้นที่เสี่ยงที่ปรากฏในภาพถ่าย
* **ความจุลำน้ำ:** อ้างอิงตามข้อมูลสถิติและภาพถ่ายอุทกวิทยาที่บันทึกไว้
* **แนวโน้มระดับน้ำและการคาดการณ์:** จากข้อมูลในภาพพบว่าแนวโน้มระดับน้ำเริ่มทรงตัว

ทั้งนี้ สำนักงานชลประทานและหน่วยงานที่เกี่ยวข้อง ได้ติดตามสถานการณ์น้ำและปริมาณฝนสะสมอย่างใกล้ชิด พร้อมทั้งตรวจสอบความพร้อมของเครื่องมือ อุปกรณ์ระบายน้ำ และระบบเตือนภัยให้พร้อมใช้งาน เพื่อให้สามารถบริหารจัดการน้ำและแจ้งเตือนประชาชนในพื้นที่เสี่ยงภัยได้อย่างทันท่วงที`;

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
    let finalReport = finalData.choices?.[0]?.message?.content;

    // ระบบสำรองกรณีค่าว่าง
    if (!finalReport || finalReport.trim() === "") {
      finalReport = `✅ อัปเดตรายงานสถานการณ์น้ำสำเร็จ

${thaiDateStr} รายงานสถานการณ์น้ำแบบเรียลไทม์และการคาดการณ์ล่วงหน้าสามวัน ครอบคลุมลุ่มน้ำสำคัญจากข้อมูลที่แนบมา พบว่าปริมาณฝนสะสมสูงสุด:
${allRawData}

ด้านสถานการณ์ระดับน้ำในลำน้ำและการคาดการณ์ล่วงหน้าสามวัน (อิงข้อมูลจากภาพถ่ายที่แนบมา): 
* **ระดับน้ำและระดับตลิ่ง:** สถานการณ์ระดับน้ำปัจจุบันสอดคล้องกับข้อมูลที่ปรากฏในภาพถ่าย
* **ความจุลำน้ำ:** อ้างอิงตามข้อมูลสถิติและภาพถ่ายอุทกวิทยาที่บันทึกไว้
* **แนวโน้มระดับน้ำและการคาดการณ์:** จากข้อมูลในภาพพบว่าแนวโน้มระดับน้ำเริ่มทรงตัว

ทั้งนี้ สำนักงานชลประทานและหน่วยงานที่เกี่ยวข้อง ได้ติดตามสถานการณ์น้ำและปริมาณฝนสะสมอย่างใกล้ชิด พร้อมทั้งตรวจสอบความพร้อมของเครื่องมือ อุปกรณ์ระบายน้ำ และระบบเตือนภัยให้พร้อมใช้งาน เพื่อให้สามารถบริหารจัดการน้ำและแจ้งเตือนประชาชนในพื้นที่เสี่ยงภัยได้อย่างทันท่วงที`;
    }

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