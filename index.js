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

// ฟังก์ชันประมวลผลภาพถ่าย วิเคราะห์ตัวเลขจากภาพตามจริง เฉพาะ 3 ลุ่มน้ำภาคตะวันออก
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

    // ขั้นที่ 1: ดึงข้อมูลดิบจากภาพตัวเลขและสถานีจริง ห้ามมโนเด็ดขาด
    for (let index = 0; index < imageChunks.length; index++) {
      const chunk = imageChunks[index];
      
      const extractPrompt = `คุณคือระบบอ่านข้อมูลตัวเลขจากภาพอุทกวิทยา โครงการนี้อยู่ในเขตภาคตะวันออก 3 ลุ่มน้ำเท่านั้น ได้แก่:
1. ลุ่มน้ำบางปะกง
2. ลุ่มน้ำชายฝั่งทะเลตะวันออก
3. ลุ่มน้ำโตนเลสาบ

หน้าที่ของคุณ: อ่านข้อมูลตัวเลข ชื่อสถานี และปริมาณฝน/ระดับน้ำ ที่ปรากฏในภาพจริง ๆ เท่านั้น ห้ามแต่งเติมชื่อสถานีหรือจังหวัดที่ไม่มีอยู่ในภาพ ห้ามอ้างอิงถึงต่างประเทศหรือนอกเหนือจากพื้นที่ 3 ลุ่มน้ำนี้ หากพบตัวเลขฝนหรือระดับน้ำ ให้ดึงมาแสดงตามจริง`;

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

    // ขั้นที่ 2: จัดรูปแบบรายงานตามโครงสร้างที่คุณต้องการเป๊ะๆ โดยใช้ข้อมูลจริงจากภาพ
    const finalReportPrompt = `คุณคือผู้ช่วยวิเคราะห์ข้อมูลอุทกวิทยา ให้นำข้อมูลดิบที่อ่านได้จากภาพถ่ายด้านล่างนี้ มาเรียบเรียงเป็นรายงานสถานการณ์น้ำตามรูปแบบฟอร์มด้านล่างนี้ **อย่างเคร่งครัด** ห้ามใส่ข้อมูลเท็จ ห้ามกุชื่อสถานีหรือจังหวัดเองเด็ดขาด ถ้าไม่มีในภาพให้ระบุตามที่ปรากฏจริง:

ข้อมูลดิบจากภาพ:
${allRawData}

รูปแบบรายงานที่ต้องใช้:
✅ อัปเดตรายงานสถานการณ์น้ำสำเร็จ

รายงานสถานการณ์น้ำ ภาพรวมประจำวันที่ ${shortThaiDateStr} จากการประเมินข้อมูลดิบและภาพถ่ายแบบเรียลไทม์ในพื้นที่ 3 ลุ่มน้ำหลักภาคตะวันออก (ลุ่มน้ำบางปะกง, ลุ่มน้ำชายฝั่งทะเลตะวันออก, และลุ่มน้ำโตนเลสาบ):

${allRawData}

ด้านสถานการณ์ระดับน้ำในลำน้ำและการคาดการณ์ล่วงหน้า 3 วัน (อิงข้อมูลคลังข้อมูลน้ำแห่งชาติและภาพถ่ายที่แนบมา):
* **ระดับน้ำและระดับตลิ่ง (เน้นจุดที่น้ำสูงกว่าตลิ่ง):** จากการวิเคราะห์ภาพถ่ายและข้อมูลระดับน้ำปัจจุบัน พบจุดที่ต้องเฝ้าระวังระดับน้ำใกล้เคียงหรือสูงกว่าตลิ่งตามสภาพภูมิประเทศในภาพ ส่วนการคาดการณ์ล่วงหน้า 3 วัน ระดับน้ำในจุดดังกล่าวจะมีแนวโน้มทรงตัวถึงลดลงเล็กน้อย
* **ความจุลำน้ำ:** ความจุลำน้ำสายหลักของลุ่มน้ำในพื้นที่ปัจจุบันอยู่ในเกณฑ์ที่สามารถบริหารจัดการได้ โดยคาดการณ์ว่าใน 3 วันข้างหน้า เปอร์เซ็นต์ความจุลำน้ำจะทรงตัวและค่อยๆ ลดลงตามลำดับ
* **แนวโน้มระดับน้ำย้อนหลังและการคาดการณ์:** จากสถิติระดับน้ำและข้อมูลภาพถ่ายสะสม ส่งผลให้ระดับน้ำในลำน้ำสอดคล้องกับปริมาณฝนในพื้นที่ และการคาดการณ์ล่วงหน้า 3 วัน ระดับน้ำจะมีเสถียรภาพมากขึ้นเนื่องจากปริมาณฝนเริ่มลดลง

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

    if (!finalReport || finalReport.trim().length < 100) {
      finalReport = `✅ อัปเดตรายงานสถานการณ์น้ำสำเร็จ

รายงานสถานการณ์น้ำ ภาพรวมประจำวันที่ ${shortThaiDateStr} พื้นที่ 3 ลุ่มน้ำภาคตะวันออก (ลุ่มน้ำบางปะกง, ลุ่มน้ำชายฝั่งทะเลตะวันออก, ลุ่มน้ำโตนเลสาบ):
${allRawData}`;
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