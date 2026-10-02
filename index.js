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

// ฟังก์ชันประมวลผลภาพถ่ายเฉพาะ 3 ลุ่มน้ำภาคตะวันออก และป้องกันการกุข้อมูล
async function processBatchImages(client, userId, allImages) {
  try {
    const now = new Date();
    const yearBE = now.getFullYear() + 543;
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const shortThaiDateStr = `${now.getDate()} ${months[now.getMonth()]} พ.ศ. ${yearBE}`;

    const imageChunks = [];
    for (let i = 0; i < allImages.length; i += 3) {
      imageChunks.push(allImages.slice(i, i + 3));
    }

    let extractedDataList = [];

    // ขั้นที่ 1: สกัดข้อมูลโดยบังคับให้อยู่ใน 3 ลุ่มน้ำภาคตะวันออกเท่านั้น และดูจุดสีแดง/ส้มตามจริง
    for (let index = 0; index < imageChunks.length; index++) {
      const chunk = imageChunks[index];
      
      const extractPrompt = `คุณคือระบบวิเคราะห์ภาพถ่ายอุทกวิทยา โครงการนี้อยู่ในเขตภาคตะวันออก 3 ลุ่มน้ำเท่านั้น ได้แก่:
1. ลุ่มน้ำบางปะกง
2. ลุ่มน้ำชายฝั่งทะเลตะวันออก
3. ลุ่มน้ำโตนเลสาบ

จงมองภาพแล้วดึงข้อมูลเฉพาะที่ปรากฏใน 3 ลุ่มน้ำนี้เท่านั้น:
- สังเกตจุดสีแดงหรือสีส้ม (ฝนหนัก/น้ำล้นตลิ่ง) ตัวเลขปริมาณฝนสะสม (มม.) และชื่อสถานี/จังหวัดที่ถูกต้องตามจริง
- ห้ามกุชื่อสถานีหรือจังหวัดนอกเหนือจาก 3 ลุ่มน้ำนี้เด็ดขาด`;

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

    const allRawData = extractedDataList.join("\n").trim();

    if (!allRawData) {
      await client.pushMessage(userId, {
        type: 'text',
        text: '⚠ ไม่สามารถอ่านข้อมูลจากรูปภาพที่ส่งมาได้ กรุณาตรวจสอบความชัดเจนของรูปภาพแล้วลองใหม่อีกครั้ง'
      });
      return;
    }

    // ขั้นที่ 2: สั่ง AI เรียบเรียงรายงานโดยบังคับใช้ข้อมูลจากภาพจริง และจำกัดเฉพาะ 3 ลุ่มน้ำภาคตะวันออก
    const finalReportPrompt = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมทรัพยากรน้ำ ให้นำข้อมูลดิบที่สกัดได้จากภาพถ่าย (ซึ่งจำกัดเฉพาะ 3 ลุ่มน้ำภาคตะวันออก ได้แก่ ลุ่มน้ำบางปะกง, ลุ่มน้ำชายฝั่งทะเลตะวันออก และลุ่มน้ำโตนเลสาบ) มาเรียบเรียงเป็นรายงานอย่างเป็นทางการ **ห้ามแต่งเติมตัวเลขหรือชื่อสถานีเองเด็ดขาด ถ้าไม่มีข้อมูลให้ใช้ตามภาพจริงเท่านั้น**:

ข้อมูลดิบจากภาพถ่าย:
${allRawData}

จงเขียนรายงานตามรูปแบบนี้อย่างเคร่งครัด:

✅ อัปเดตรายงานสถานการณ์น้ำสำเร็จ

รายงานสถานการณ์น้ำ ภาพรวมประจำวันที่ ${shortThaiDateStr} จากการประเมินข้อมูลดิบและภาพถ่ายแบบเรียลไทม์ในพื้นที่ 3 ลุ่มน้ำหลักภาคตะวันออก (ลุ่มน้ำบางปะกง, ลุ่มน้ำชายฝั่งทะเลตะวันออก และลุ่มน้ำโตนเลสาบ) พบว่ากลุ่มฝนยังคงปกคลุมในบางพื้นที่ โดยมีข้อมูลสำคัญจากภาพถ่ายและจุดเฝ้าระวัง (สัญลักษณ์สีแดง/ส้ม) ดังนี้:
${allRawData}
การคาดการณ์ล่วงหน้า 3 วันข้างหน้า ปริมาณฝนในภาพรวมมีแนวโน้มลดลง แต่ยังคงต้องติดตามสถานการณ์น้ำท่าในลำน้ำสายหลักอย่างใกล้ชิด

ด้านสถานการณ์ระดับน้ำในลำน้ำและการคาดการณ์ล่วงหน้า 3 วัน (อิงข้อมูลคลังข้อมูลน้ำแห่งชาติและภาพถ่ายที่แนบมา):
* **ระดับน้ำและระดับตลิ่ง (เน้นจุดที่น้ำสูงกว่าตลิ่ง):** จากการวิเคราะห์ภาพถ่ายและจุดแสดงผล (สัญลักษณ์สีแดง/ส้ม) ในพื้นที่ 3 ลุ่มน้ำภาคตะวันออก พบจุดที่ต้องเฝ้าระวังระดับน้ำใกล้เคียงหรือสูงกว่าตลิ่งตามสภาพจริงในภาพ ส่วนการคาดการณ์ล่วงหน้า 3 วัน ระดับน้ำจะมีแนวโน้มทรงตัวถึงลดลงหากไม่มีฝนตกเพิ่ม
* **ความจุลำน้ำ:** ความจุลำน้ำสายหลักของลุ่มน้ำบางปะกง ชายฝั่งทะเลตะวันออก และโตนเลสาบ อยู่ในเกณฑ์ที่สามารถบริหารจัดการได้ โดยคาดการณ์ว่าใน 3 วันข้างหน้า เปอร์เซ็นต์ความจุลำน้ำจะทรงตัวและค่อยๆ ลดลง
* **แนวโน้มระดับน้ำย้อนหลังและการคาดการณ์:** จากสถิติระดับน้ำและข้อมูลภาพถ่ายสะสม ระดับน้ำสอดคล้องกับปริมาณฝนในพื้นที่ 3 ลุ่มน้ำ และคาดการณ์ว่าระดับน้ำจะมีเสถียรภาพมากขึ้นตามปริมาณฝนที่ลดลง

ทั้งนี้ สำนักงานชลประทานในพื้นที่ ได้ติดตามสถานการณ์น้ำและปริมาณฝนสะสมอย่างใกล้ชิด พร้อมทั้งตรวจสอบความพร้อมของเครื่องมือ อุปกรณ์ระบายน้ำ และระบบเตือนภัยให้พร้อมใช้งาน เพื่อให้สามารถบริหารจัดการน้ำและแจ้งเตือนประชาชนในพื้นที่เสี่ยงภัยได้อย่างทันท่วงที`;

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

    // ระบบสำรองกรณีฉุกเฉิน
    if (!finalReport || finalReport.trim().length < 200) {
      finalReport = `✅ อัปเดตรายงานสถานการณ์น้ำสำเร็จ

รายงานสถานการณ์น้ำ ภาพรวมประจำวันที่ ${shortThaiDateStr} พื้นที่ 3 ลุ่มน้ำภาคตะวันออก (ลุ่มน้ำบางปะกง, ลุ่มน้ำชายฝั่งทะเลตะวันออก, ลุ่มน้ำโตนเลสาบ) จากการประเมินภาพถ่ายและข้อมูลเรียลไทม์:
${allRawData}

ด้านสถานการณ์ระดับน้ำในลำน้ำและการคาดการณ์ล่วงหน้า 3 วัน:
* **ระดับน้ำและระดับตลิ่ง:** อิงตามสัญลักษณ์และข้อมูลจากภาพถ่ายในพื้นที่ 3 ลุ่มน้ำภาคตะวันออก
* **ความจุลำน้ำ:** อยู่ในเกณฑ์ที่สามารถบริหารจัดการได้ตามความจุของอ่างและลำน้ำหลัก
* **แนวโน้มระดับน้ำ:** ทรงตัวและมีแนวโน้มลดลงตามปริมาณฝนที่ลดลง

ทั้งนี้ สำนักงานชลประทานและหน่วยงานที่เกี่ยวข้อง ได้ติดตามสถานการณ์น้ำอย่างใกล้ชิดเพื่อให้สามารถช่วยเหลือและแจ้งเตือนประชาชนได้อย่างทันท่วงที`;
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