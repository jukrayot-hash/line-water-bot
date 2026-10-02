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

// ฟังก์ชันซอยรูปภาพออกเป็นกลุ่มละ 3 รูป แล้วส่งประมวลผล (ควบคุมไม่ให้ AI มั่วข้อมูล)
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

    for (let index = 0; index < imageChunks.length; index++) {
      const chunk = imageChunks[index];
      
      const chunkPrompt = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมทรัพยากรน้ำและอุทกวิทยา หน้าที่ของคุณคือนำ "ภาพถ่ายหน้าจอข้อมูลสถานการณ์น้ำหรือปริมาณฝนสะสม" ที่ส่งมาทาง LINE มาทำการวิเคราะห์และเรียบเรียงเป็นรายงานสถานการณ์น้ำอย่างละเอียด

⚠️ **กฎเหล็กสำคัญที่สุด (เคร่งครัดมาก):**
1. **อ่านข้อมูลจากรูปภาพที่แนบมาเท่านั้น:** ให้ตรวจสอบตัวเลข สถานี พื้นที่ ระดับน้ำ ระดับตลิ่ง หรือปริมาณฝน (มม.) ที่ปรากฏอยู่ในรูปภาพโดยละเอียด แล้วนำตัวเลขจริงเหล่านั้นมาเขียนรายงาน ห้ามแต่งเติมหรือกุตัวเลขขึ้นมาเองเด็ดขาด
2. ในข้อความรายงาน **ต้องระบุตัวเลขวันที่อย่างชัดเจน คือ ${thaiDateStr}** เป็นภาษาไทยทั้งหมด ห้ามมีคำภาษาอังกฤษปะปน และใช้คำว่า **"พ.ศ."** แทนการสะกดเต็ม
3. หากในภาพมีข้อมูล **สถานีที่ระดับน้ำล้นตลิ่ง** หรือมี **ปริมาณฝนสะสม 24 ชม. สูงๆ** ให้หยิบยกตัวเลขและชื่อสถานีเหล่านั้นมาวิเคราะห์ในรายงานให้เด่นชัด
4. ใช้ภาษาไทยที่เป็นทางการ สละสลวย จัดรูปแบบหัวข้อและย่อหน้าให้อ่านง่าย

ใช้โครงสร้างรายงานตามรูปแบบนี้:

${thaiDateStr} สรุปภาพรวมสถานการณ์น้ำและปริมาณฝนในพื้นที่จากข้อมูลและภาพถ่ายหน้าจอที่รวบรวมจากระบบอุทกวิทยา พบว่ามีหลายพื้นที่ในลุ่มน้ำต่างๆ ได้รับอิทธิพลจากปริมาณฝนสะสม 24 ชั่วโมงในเกณฑ์ปานกลางถึงหนัก โดยมีบางสถานีวัดปริมาณฝนสะสมสูงกว่า 50 มิลลิเมตร ซึ่งส่งผลให้ระดับน้ำในลำน้ำบางแห่งมีแนวโน้มเพิ่มสูงขึ้นและอยู่ในเกณฑ์ที่ต้องเฝ้าระวังอย่างใกล้ชิด

ด้านสถานการณ์ระดับน้ำในลำน้ำและปริมาณฝนสะสม (อิงจากภาพถ่ายที่แนบมา)

* **สถานการณ์ระดับน้ำและจุดที่ล้นตลิ่ง:** 
  * [ระบุชื่อสถานี พื้นที่ และตัวเลขระดับน้ำ/ระดับตลิ่ง จากในภาพจริง]
* **ปริมาณฝนสะสม 24 ชั่วโมง:** 
  * [ระบุชื่อสถานีและปริมาณฝนที่เป็นตัวเลข มม. จากในภาพจริง]
* **แนวโน้มระดับน้ำและการคาดการณ์ล่วงหน้า 3 วัน (จาก Thaiwater):** 
  * ระดับน้ำในปัจจุบันของสถานีส่วนใหญ่มีแนวโน้มทรงตัวและเปลี่ยนแปลงตามปริมาณฝนที่ตกลงมาในพื้นที่ 
  * สำหรับการคาดการณ์ล่วงหน้า 3 วันข้างหน้า (อิงจากระบบคลังข้อมูลน้ำแห่งชาติ Thaiwater) หากยังมีฝนตกสะสมต่อเนื่องในพื้นที่ต้นน้ำและพื้นที่รับน้ำ จะส่งผลให้ระดับน้ำในลำน้ำยังคงทรงตัวในเกณฑ์สูงหรือมีแนวโน้มล้นตลิ่งในจุดเสี่ยงเดิมอย่างต่อเนื่อง จำเป็นต้องเฝ้าระวังสถานการณ์น้ำท่วมฉับพลันและน้ำป่าไหลหลาก

บทสรุปการบริหารจัดการน้ำและแนวทางการปฏิบัติงานในพื้นที่สำหรับเจ้าหน้าที่ เน้นย้ำให้หน่วยงานและเจ้าหน้าที่ผู้ปฏิบัติงานในพื้นที่ติดตามสถานการณ์น้ำและปริมาณฝนสะสมอย่างใกล้ชิดตลอด 24 ชั่วโมง โดยเฉพาะในพื้นที่ที่มีฝนสะสมเกิน 50 มิลลิเมตร พร้อมทั้งตรวจสอบความพร้อมของเครื่องมือ อุปกรณ์ระบายน้ำ และระบบเตือนภัยให้พร้อมใช้งาน เพื่อให้สามารถแจ้งเตือนประชาชนในพื้นที่เสี่ยงภัยริมลำน้ำได้อย่างทันท่วงทีและมีประสิทธิภาพสูงสุด`;

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
          temperature: 0.0 // ตั้งค่าเป็น 0.0 เพื่อบังคับให้ตอบตามภาพจริง 100% ห้ามคิดเอง
        })
      });

      const data = await response.json();
      const reportPart = data.choices?.[0]?.message?.content;
      if (reportPart) {
        partialReports.push(reportPart);
      }
    }

    const combinedContent = partialReports.join("\n\n");

    const finalReportPrompt = `คุณคือนักวิเคราะห์ข้อมูลทรัพยากรน้ำ นำข้อมูลที่สกัดได้จากภาพถ่ายจริงด้านล่างนี้ มาเรียบเรียงเป็นรายงานสถานการณ์น้ำทางการ **โดยห้ามใส่ชื่อจังหวัด ลุ่มน้ำ หรือสถานที่ใดๆ ที่นอกเหนือจากข้อมูลดิบด้านล่างนี้เด็ดขาด**

วันที่รายงาน: ${thaiDateStr}
ข้อมูลดิบที่อ่านได้จากภาพถ่ายจริงทั้งหมด:
${combinedContent}

จัดรูปแบบรายงานให้อ่านง่าย เป็นทางการ ดังนี้:
${thaiDateStr} สรุปรายงานสถานการณ์น้ำและปริมาณฝน (จากภาพถ่ายหน้าจอ ${allImages.length} ภาพ)

* **สถานการณ์ระดับน้ำและจุดที่ล้นตลิ่ง:**
  * [สรุปเฉพาะชื่อสถานีและตัวเลขจากข้อมูลดิบด้านบนเท่านั้น]
* **ปริมาณฝนสะสม 24 ชั่วโมง:**
  * [สรุปเฉพาะตัวเลขปริมาณฝนจากข้อมูลดิบด้านบนเท่านั้น]
* **แนวโน้มระดับน้ำและการคาดการณ์:**
  * [สรุปแนวโน้มตามข้อมูลที่มี ห้ามแต่งเพิ่ม]`;

    const finalResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [{ role: "user", content: finalReportPrompt }],
        temperature: 0.0 // ล็อกค่าความแม่นยำสูงสุด ห้ามแต่งเติม
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
}
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});