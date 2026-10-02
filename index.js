const express = require('express');
const line = require('@line/bot-sdk');
const fetch = require('node-fetch');

const lineConfig = {
  channelAccessToken: "pikOSiC2zLbWGKEgVC4V+mdBd90Ly8wXYy4lNtzwvDJaFBCCaxJ3pP2Baz9URzpZ4xLQ3slkGEdkdVCxRQcB6/OjWrbNlrnjp5cgwECvjgjyUtA9nyIzoRuj62AS2ljDQ3Kun5Oo8NYKjamuei1OrAdB04t89/1O/w1cDnyilFU=",
  channelSecret: "8799e485fb872e777415e818f303c5cf"
};

// ⚠️ หมายเหตุ: อย่าลืมเปลี่ยนเป็น API Key จริงที่ขึ้นต้นด้วย "AIzaSy..." จาก Google AI Studio
const GEMINI_API_KEY = "AQ.Ab8RN6JOkhfjxgVCfS5lbwIMXJ3S2LZZ8uc56JaB_PkKq7GjHg";

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
      text: '🔄 ระบบกำลังดึงภาพและวิเคราะห์สถานการณ์น้ำ กรุณารอสักครู่...'
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

    const systemPrompt = `คุณคือผู้เชี่ยวชาญด้านวิศวกรรมทรัพยากรน้ำและอุทกวิทยา หน้าที่ของคุณคือนำ "ภาพถ่ายหน้าจอข้อมูลสถานการณ์น้ำหรือปริมาณฝนสะสม" ที่ส่งมาทาง LINE มาทำการวิเคราะห์และเรียบเรียงเป็นรายงานสถานการณ์น้ำอย่างละเอียด

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

    // ระบบวนลูปทดสอบโมเดลสำรองอัตโนมัติ (Fallback Loop)
    const candidateModels = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"];
    let aiReport = null;

    for (let m = 0; m < candidateModels.length; m++) {
      const model = candidateModels[m];
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      try {
        console.log(`กำลังลองส่งข้อมูลด้วยโมเดล: ${model}`);
        
        const aiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: systemPrompt },
                  {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: base64Image
                    }
                  }
                ]
              }
            ]
          })
        });

        const aiData = await aiResponse.json();
        
        if (aiData.candidates && aiData.candidates[0] && aiData.candidates[0].content) {
          aiReport = aiData.candidates[0].content.parts[0].text;
          console.log(`สำเร็จ! ใช้โมเดล: ${model}`);
          break;
        } else {
          console.log(`โมเดล ${model} ตอบกลับไม่สมบูรณ์:`, JSON.stringify(aiData));
        }
      } catch (e) {
        console.error(`Model ${model} error:`, e.message);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!aiReport) {
      aiReport = "⚠ ไม่สามารถวิเคราะห์ข้อมูลจากภาพได้ (AI ไม่ส่งข้อมูลกลับมา)";
    }

    await client.pushMessage(event.source.userId, {
      type: 'text',
      text: aiReport
    });

  } catch (error) {
    console.error("Error processing image:", error);
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