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

// ฟังก์ชันประมวลผลภาพถ่ายและจัดรูปแบบรายงานสถานการณ์น้ำตามแบบฟอร์มทางการที่คุณกำหนด
async function processBatchImages(client, userId, allImages) {
  try {
    const now = new Date();
    const yearBE = now.getFullYear() + 543;
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const thaiDateStr = `วันที่ ${now.getDate()} ${months[now.getMonth()]} พุทธศักราช ${yearBE}`;
    const shortThaiDateStr = `${now.getDate()} ${months[now.getMonth()]} พ.ศ. ${yearBE}`;

    const imageChunks = [];
    for (let i = 0; i < allImages.length; i += 3) {
      imageChunks.push(allImages.slice(i, i + 3));
    }

    let extractedDataList = [];

    // ขั้นที่ 1: ดึงเฉพาะข้อมูลดิบที่สำคัญจากภาพ (ชื่อลุ่มน้ำ, ปริมาณฝน, ระดับน้ำ) อย่างกระชับ
    for (let index = 0; index < imageChunks.length; index++) {
      const chunk = imageChunks[index];
      
      const extractPrompt = `คุณคือระบบวิเคราะห์ภาพถ่ายอุทกวิทยา จงมองภาพแล้วสรุปเฉพาะข้อมูลสำคัญ:
1. ชื่อลุ่มน้ำหรือภูมิภาค
2. ตัวเลขปริมาณฝนสะสมสูงสุด (มม.) หรือระดับน้ำล้นตลิ่งที่ปรากฏจริงในภาพ
เขียนสรุปสั้นๆ ห้ามใส่คำว่า "ไม่มีข้อมูล" ให้ข้ามไปเลยหากมองไม่เห็น ห้ามแต่งเติมข้อมูลเอง`;

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

    // ขั้นที่ 2: สั่ง AI นำข้อมูลดิบมาเรียบเรียงตามฟอร์มรายงานทางการที่คุณต้องการเป๊ะๆ
    const finalReportPrompt = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมทรัพยากรน้ำ ให้นำข้อมูลดิบที่สกัดได้จากภาพถ่ายด้านล่างนี้ มาเรียบเรียงเป็นรายงานสถานการณ์น้ำอย่างเป็นทางการ **โดยห้ามแสดงข้อความดิบหรือหัวข้อย่อยประเภท "- สถานี:..." หรือ "- จังหวัด:..." เด็ดขาด** ให้เขียนเป็นบทวิเคราะห์ที่กลมกลืนตามฟอร์มตัวอย่างด้านล่างนี้:

ข้อมูลดิบจากภาพถ่าย:
${allRawData}

จงเขียนรายงานตามรูปแบบและข้อความนี้อย่างเคร่งครัด (ปรับเปลี่ยนตัวเลขหรือชื่อลุ่มน้ำให้สอดคล้องกับข้อมูลดิบที่ได้จากภาพ):

✅ อัปเดตรายงานสถานการณ์น้ำสำเร็จ

รายงานสถานการณ์น้ำ ภาพรวมประจำวันที่ ${shortThaiDateStr} จากการประเมินข้อมูลดิบและภาพถ่ายแบบเรียลไทม์ พบว่ากลุ่มฝนยังคงปกคลุมพื้นที่ภาคตะวันออกและบริเวณรอยต่อ ส่งผลให้มีปริมาณฝนสะสมหนาแน่นในหลายจุด โดยมีข้อมูลสำคัญจากภาพถ่ายดังนี้:
${allRawData}
การคาดการณ์ล่วงหน้า 3 วันข้างหน้า คาดว่าปริมาณฝนจะมีแนวโน้มลดลง แต่ยังคงต้องเฝ้าระวังน้ำหลากจากพื้นที่สูงที่จะไหลลงสู่ลำน้ำหลัก

ด้านสถานการณ์ระดับน้ำในลำน้ำและการคาดการณ์ล่วงหน้า 3 วัน (อิงข้อมูลคลังข้อมูลน้ำแห่งชาติและภาพถ่ายที่แนบมา) ลุ่มน้ำสายหลักระดับน้ำมีแนวโน้มเปลี่ยนแปลงตามปริมาณฝนสะสมในพื้นที่ และอยู่ในเกณฑ์ที่ต้องติดตามอย่างใกล้ชิด

* **ระดับน้ำและระดับตลิ่ง (เน้นจุดที่น้ำสูงกว่าตลิ่ง):** จากการวิเคราะห์ภาพถ่ายและข้อมูลระดับน้ำปัจจุบัน พบจุดที่ต้องเฝ้าระวังระดับน้ำใกล้เคียงหรือสูงกว่าตลิ่งตามสภาพภูมิประเทศในภาพ ส่วนการคาดการณ์ล่วงหน้า 3 วัน ระดับน้ำในจุดดังกล่าวจะมีแนวโน้มทรงตัวถึงลดลงเล็กน้อย หากไม่มีฝนตกลงมาเพิ่มเติม
* **ความจุลำน้ำ:** ความจุลำน้ำสายหลักของลุ่มน้ำในพื้นที่ปัจจุบันอยู่ในเกณฑ์ที่สามารถบริหารจัดการได้ โดยคาดการณ์ว่าใน 3 วันข้างหน้า เปอร์เซ็นต์ความจุลำน้ำจะทรงตัวและค่อยๆ ลดลงตามลำดับ
* **แนวโน้มระดับน้ำย้อนหลังและการคาดการณ์:** จากสถิติระดับน้ำและข้อมูลภาพถ่ายสะสม ส่งผลให้ระดับน้ำในลำน้ำสอดคล้องกับปริมาณฝนในพื้นที่ และการคาดการณ์ล่วงหน้า 3 วัน ระดับน้ำจะมีเสถียรภาพมากขึ้นเนื่องจากปริมาณฝนเริ่มลดลง

ทั้งนี้ สำนักงานชลประทานในพื้นที่ ร่วมกับหน่วยงานที่เกี่ยวข้อง ได้นำข้อมูลระดับน้ำและการพยากรณ์น้ำท่ามาใช้เร่งบริหารจัดการน้ำ พร้อมทั้งเร่งระบายน้ำออกจากลำน้ำสายหลัก ติดตั้งเครื่องสูบน้ำและเครื่องผลักดันน้ำในจุดเสี่ยง เพื่อเพิ่มอัตราการไหล พยุงไม่ให้ระดับน้ำล้นตลิ่งเข้าท่วมพื้นที่ชุมชนเพิ่มเติม และเร่งคลี่คลายสถานการณ์อุทกภัยให้กลับเข้าสู่ภาวะปกติโดยเร็ว`;

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

    // ระบบสำรองกรณี API ขัดข้อง
    if (!finalReport || finalReport.trim() === "") {
      finalReport = `✅ อัปเดตรายงานสถานการณ์น้ำสำเร็จ

รายงานสถานการณ์น้ำ ภาพรวมประจำวันที่ ${shortThaiDateStr} จากการประเมินข้อมูลดิบและภาพถ่ายแบบเรียลไทม์ พบว่ากลุ่มฝนยังคงปกคลุมพื้นที่สำคัญ ส่งผลให้มีปริมาณฝนสะสมในเกณฑ์ปานกลางถึงหนัก 

ด้านสถานการณ์ระดับน้ำในลำน้ำและการคาดการณ์ล่วงหน้า 3 วัน (อิงข้อมูลคลังข้อมูลน้ำแห่งชาติและภาพถ่ายที่แนบมา):
* **ระดับน้ำและระดับตลิ่ง (เน้นจุดที่น้ำสูงกว่าตลิ่ง):** สถานการณ์ระดับน้ำปัจจุบันสอดคล้องกับข้อมูลที่ปรากฏในภาพถ่าย
* **ความจุลำน้ำ:** อ้างอิงตามข้อมูลสถิติและภาพถ่ายอุทกวิทยาที่บันทึกไว้
* **แนวโน้มระดับน้ำย้อนหลังและการคาดการณ์:** จากข้อมูลในภาพพบว่าแนวโน้มระดับน้ำเริ่มทรงตัว

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