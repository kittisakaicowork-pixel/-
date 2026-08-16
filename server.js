const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());

const DATABASE_URL = process.env.DATABASE_URL;
const isLocalDb = !DATABASE_URL || DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1");
const pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL, ssl: isLocalDb ? false : { rejectUnauthorized: false } })
  : null;

/* ================= SESSIONS (lightweight token auth) ================= */
// In-memory on purpose: login already doesn't survive a page refresh in this app,
// so losing sessions on a server restart matches existing behavior.
const SESSIONS = new Map(); // token -> {username, role}
function issueToken(username, role) {
  const token = crypto.randomBytes(24).toString("hex");
  SESSIONS.set(token, { username, role });
  return token;
}
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const session = token && SESSIONS.get(token);
  if (!session) return res.status(401).json({ error: "กรุณาเข้าสู่ระบบ" });
  req.authUser = session;
  next();
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.authUser.role !== "admin") return res.status(403).json({ error: "เฉพาะผู้ดูแลระบบเท่านั้น" });
    next();
  });
}
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  req.authUser = (token && SESSIONS.get(token)) || null;
  next();
}

/* ================= SEED DATA ================= */
const SEED_RESTAURANTS = [
  {id:1,name:"Leam Charoen Seafood",type:"ไทย",floor:"B",zone:"โซน B",price:"พรีเมียม",rating:4.3,recommended:["ปูผัดผงกะหรี่","กุ้งเผา","ยำทะเลรวม"],hours:"11:00 - 21:30",tags:["อาหารทะเลสด","เหมาะกับครอบครัว"],contact:"02-958-4001",delivery:["Grab","Robinhood"],pax:["2-4","5+"],isNew:false},
  {id:2,name:"Nen Neua",type:"ไทย",floor:"B",zone:"โซน B",price:"พรีเมียม",rating:4.4,recommended:["เนื้อย่างเกลือ","ต้มแซ่บเนื้อ","ข้าวเหนียว"],hours:"11:00 - 21:00",tags:["เนื้อคุณภาพพรีเมียม"],contact:"02-958-4002",delivery:["Grab"],pax:["2-4","5+"],isNew:false},
  {id:3,name:"Krua Mae Sri Ruen",type:"ไทย",floor:"2",zone:"โซน Zpell ชั้น 2",price:"ถูก",rating:4.1,recommended:["ผัดกะเพราหมูสับ","แกงเขียวหวานไก่","ข้าวผัดกุ้ง"],hours:"10:00 - 21:00",tags:["อาหารตามสั่งรสมือแม่"],contact:"02-958-4003",delivery:["Grab","Lineman"],pax:["solo","2-4"],isNew:false},
  {id:4,name:"Jeh Daeng Sam Yan",type:"ไทย",floor:"B",zone:"โซน B",price:"ถูก",rating:4.0,recommended:["ข้าวขาหมู","บะหมี่เกี๊ยวหมูแดง"],hours:"10:00 - 20:30",tags:["สตรีทฟู้ดชื่อดัง"],contact:"02-958-4004",delivery:["Lineman","Robinhood"],pax:["solo","2-4"],isNew:false},
  {id:5,name:"Audrey Cafe & Bistro",type:"ไทย",floor:"2",zone:"โซน 2",price:"ปานกลาง",rating:4.2,recommended:["ผัดไทยกุ้งสด","ข้าวคลุกกะปิ","อัญชันโซดา"],hours:"10:00 - 21:30",tags:["บรรยากาศดี","ถ่ายรูปสวย"],contact:"02-958-4005",delivery:["Grab","Robinhood"],pax:["2-4","5+"],isNew:false},
  {id:6,name:"Fuji Restaurant",type:"ญี่ปุ่น",floor:"B",zone:"โซน B",price:"ปานกลาง",rating:4.2,recommended:["ซาชิมิรวม","เทมปุระ","ข้าวหน้าปลาไหล"],hours:"10:30 - 21:30",tags:["บรรยากาศดี"],contact:"02-958-4006",delivery:["Grab","Robinhood"],pax:["solo","2-4"],isNew:false},
  {id:7,name:"Sushiro",type:"ญี่ปุ่น",floor:"B",zone:"โซน B",price:"ปานกลาง",rating:4.3,recommended:["ซูชิสายพาน","เท็มปุระอุด้ง"],hours:"10:30 - 21:30",tags:["ซูชิสายพาน","คิวเยอะช่วงเย็น"],contact:"02-958-4007",delivery:["Grab"],pax:["solo","2-4"],isNew:false},
  {id:8,name:"Shinkanzen Sushi",type:"ญี่ปุ่น",floor:"B",zone:"โซน B",price:"ปานกลาง",rating:4.4,recommended:["ซูชิหน้าปลาแซลมอน","ชุดซาชิมิพรีเมียม"],hours:"11:00 - 21:00",tags:["คิวเยอะช่วงเย็น"],contact:"02-958-4008",delivery:["Grab","Robinhood"],pax:["solo","2-4"],isNew:false},
  {id:9,name:"Katsuya",type:"ญี่ปุ่น",floor:"B",zone:"โซน B",price:"ปานกลาง",rating:4.1,recommended:["ทงคัตสึหมู","ข้าวแกงกะหรี่คัตสึ"],hours:"10:00 - 21:00",tags:["ทงคัตสึกรอบนอกนุ่มใน"],contact:"02-958-4009",delivery:["Grab","Lineman"],pax:["solo","2-4"],isNew:false},
  {id:10,name:"Karayama",type:"ญี่ปุ่น",floor:"2",zone:"โซน 2",price:"ถูก",rating:4.0,recommended:["ไก่คาราอาเกะ","ข้าวหน้าไก่ทอด"],hours:"10:00 - 21:00",tags:["ไก่ทอดสไตล์ญี่ปุ่น"],contact:"02-958-4010",delivery:["Grab","Lineman"],pax:["solo"],isNew:false},
  {id:11,name:"Bankara Ramen",type:"ญี่ปุ่น",floor:"2",zone:"โซน 2",price:"ปานกลาง",rating:4.3,recommended:["ราเมงต้นตำรับ","ราเมงซุปข้น"],hours:"10:30 - 21:00",tags:["ซุปเข้มข้น","New"],contact:"02-958-4011",delivery:["Grab"],pax:["solo","2-4"],isNew:true},
  {id:12,name:"CoCo ICHIBANYA",type:"ญี่ปุ่น",floor:"G",zone:"โซน G",price:"ปานกลาง",rating:4.2,recommended:["ข้าวแกงกะหรี่หมูทอด","แกงกะหรี่ผักรวม"],hours:"10:00 - 21:30",tags:["ปรับระดับความเผ็ดได้"],contact:"02-958-4012",delivery:["Grab","Lineman"],pax:["solo","2-4"],isNew:false},
  {id:13,name:"Chabuton Ramen",type:"ญี่ปุ่น",floor:"G",zone:"โซน G",price:"ปานกลาง",rating:4.1,recommended:["ราเมงทงคตสึ","เกี๊ยวซ่า"],hours:"10:00 - 21:00",tags:["ราเมงรางวัลระดับโลก"],contact:"02-958-4013",delivery:["Grab"],pax:["solo","2-4"],isNew:false},
  {id:14,name:"Hongmin",type:"จีน/ติ่มซำ",floor:"B",zone:"โซน B",price:"ปานกลาง",rating:4.2,recommended:["เป็ดปักกิ่ง","ติ่มซำรวม"],hours:"10:00 - 21:00",tags:["จีนกวางตุ้งต้นตำรับ"],contact:"02-958-4014",delivery:["Grab","Robinhood"],pax:["2-4","5+"],isNew:false},
  {id:15,name:"Liu Xiang Fong",type:"จีน/ติ่มซำ",floor:"2",zone:"โซน Zpell ชั้น 2",price:"ปานกลาง",rating:4.1,recommended:["บะหมี่เป็ดพะโล้","ข้าวหมูแดงฮ่องกง"],hours:"10:00 - 20:30",tags:["สูตรฮ่องกงแท้"],contact:"02-958-4015",delivery:["Lineman"],pax:["solo","2-4"],isNew:false},
  {id:16,name:"Boon Tong Kee",type:"จีน/ติ่มซำ",floor:"B",zone:"โซน B",price:"ปานกลาง",rating:4.3,recommended:["ข้าวมันไก่สิงคโปร์","เป็ดพะโล้"],hours:"10:30 - 21:00",tags:["สูตรสิงคโปร์แท้","New"],contact:"02-958-4016",delivery:["Grab","Robinhood"],pax:["solo","2-4"],isNew:true},
  {id:17,name:"Spicy Cat (La Meow)",type:"จีน/ติ่มซำ",floor:"2",zone:"โซน 2",price:"ปานกลาง",rating:4.0,recommended:["สุกี้หม่าล่า","ไก่ทอดพริกแห้ง"],hours:"11:00 - 21:00",tags:["รสจัดจ้านสไตล์เสฉวน"],contact:"02-958-4017",delivery:["Grab"],pax:["2-4","5+"],isNew:false},
  {id:18,name:"Bonchon",type:"เกาหลี",floor:"2",zone:"โซน 2",price:"ปานกลาง",rating:4.3,recommended:["ไก่ทอดซอสเกาหลี","ต๊อกบกกี"],hours:"10:00 - 21:30",tags:["ของหวานยอดฮิต"],contact:"02-958-4018",delivery:["Grab","Lineman"],pax:["solo","2-4"],isNew:false},
  {id:19,name:"Daidomon",type:"เกาหลี",floor:"B",zone:"โซน B",price:"ปานกลาง",rating:4.1,recommended:["หมูสามชั้นย่างเกาหลี","ซุปคิมจิ"],hours:"11:00 - 21:30",tags:["ปิ้งย่างเกาหลีต้นตำรับ"],contact:"02-958-4019",delivery:["Grab"],pax:["2-4","5+"],isNew:false},
  {id:20,name:"Nice Two Meat U",type:"เกาหลี",floor:"3",zone:"โซน 3",price:"พรีเมียม",rating:4.2,recommended:["หมูย่างเกาหลีบุฟเฟต์","ซัมกยอบซัล"],hours:"11:00 - 22:00",tags:["บุฟเฟต์ปิ้งย่างคุ้มค่า"],contact:"02-958-4020",delivery:["Grab"],pax:["2-4","5+"],isNew:false},
  {id:21,name:"Seoul Garden",type:"เกาหลี",floor:"2",zone:"โซน Zpell ชั้น 2",price:"พรีเมียม",rating:4.0,recommended:["บุฟเฟต์ปิ้งย่างเกาหลี","บิบิมบับ"],hours:"11:00 - 21:30",tags:["บุฟเฟต์นานาชาติเกาหลี"],contact:"02-958-4021",delivery:["Grab"],pax:["2-4","5+"],isNew:false},
  {id:22,name:"Dak Galbi",type:"เกาหลี",floor:"G",zone:"โซน G",price:"ปานกลาง",rating:4.2,recommended:["ไก่ผัดซอสเกาหลี","ต๊อกบกกีชีส"],hours:"10:00 - 21:00",tags:["รสเผ็ดหวานกลมกล่อม"],contact:"02-958-4022",delivery:["Grab","Lineman"],pax:["2-4"],isNew:false},
  {id:23,name:"BHC Chicken",type:"เกาหลี",floor:"B",zone:"โซน B",price:"ปานกลาง",rating:4.1,recommended:["ไก่ทอดเกาหลีซอสฮันนี่","วิงส์ทอด"],hours:"10:30 - 21:00",tags:["ไก่ทอดเกาหลียอดฮิต"],contact:"02-958-4023",delivery:["Grab","Lineman","Robinhood"],pax:["solo","2-4"],isNew:false},
  {id:24,name:"Sizzler",type:"ตะวันตก/สเต็ก",floor:"3",zone:"โซน 3",price:"ปานกลาง",rating:4.1,recommended:["สเต็กเนื้อ","สลัดบาร์","ซุปข้าวโพด"],hours:"10:00 - 22:00",tags:["สลัดบาร์ไม่อั้น","เหมาะกับครอบครัว"],contact:"02-958-4024",delivery:["Grab","Lineman","Robinhood"],pax:["2-4","5+"],isNew:false},
  {id:25,name:"Santa Fe' Steak",type:"ตะวันตก/สเต็ก",floor:"B",zone:"โซน B",price:"ถูก",rating:3.9,recommended:["สเต็กหมู","สปาเก็ตตี้ขี้เมา"],hours:"10:00 - 21:00",tags:["สเต็กราคาคุ้มค่า"],contact:"02-958-4025",delivery:["Grab","Lineman"],pax:["solo","2-4"],isNew:false},
  {id:26,name:"Pizza Hut",type:"ตะวันตก/สเต็ก",floor:"2",zone:"โซน 2",price:"ปานกลาง",rating:3.9,recommended:["พิซซ่าฮาวายเอี้ยน","สปาเก็ตตี้คาโบนาร่า"],hours:"10:00 - 21:30",tags:["เหมาะกับครอบครัว"],contact:"02-958-4026",delivery:["Grab","Lineman","Robinhood"],pax:["2-4","5+"],isNew:false},
  {id:27,name:"เดอะ พิซซ่า คอมปะนี",type:"ตะวันตก/สเต็ก",floor:"3",zone:"โซน 3",price:"ปานกลาง",rating:3.8,recommended:["พิซซ่าซีฟู้ดรวมมิตร","ไก่ป๊อป"],hours:"10:00 - 21:30",tags:["โปรโมชั่นเยอะ"],contact:"02-958-4027",delivery:["Grab","Lineman"],pax:["2-4","5+"],isNew:false},
  {id:28,name:"MK Restaurants",type:"ชาบู/บาร์บีคิว/บุฟเฟต์",floor:"G",zone:"โซน Robinson ชั้น G",price:"ปานกลาง",rating:4.0,recommended:["เป็ดย่าง","สุกี้ชุดครอบครัว","น้ำจิ้มสุกี้รสเด็ด"],hours:"10:00 - 21:00",tags:["เหมาะกับครอบครัว","คิวเยอะช่วงเย็น"],contact:"02-958-4028",delivery:["Grab","Lineman"],pax:["2-4","5+"],isNew:false},
  {id:29,name:"Bar B Q Plaza",type:"ชาบู/บาร์บีคิว/บุฟเฟต์",floor:"B",zone:"โซน Robinson ชั้น B",price:"ปานกลาง",rating:4.2,recommended:["หมูย่างเกาหลี","ซุปสุกี้","ลูกชิ้นรวม"],hours:"10:00 - 21:30",tags:["บุฟเฟต์คุ้มค่า","คิวเยอะช่วงเย็น"],contact:"02-958-4029",delivery:["Grab"],pax:["2-4","5+"],isNew:false},
  {id:30,name:"Shabushi",type:"ชาบู/บาร์บีคิว/บุฟเฟต์",floor:"B",zone:"โซน B",price:"ปานกลาง",rating:4.0,recommended:["ชาบูสายพาน","ซูชิสายพาน"],hours:"10:00 - 21:30",tags:["บุฟเฟต์คุ้มค่า"],contact:"02-958-4030",delivery:["Grab","Lineman"],pax:["solo","2-4"],isNew:false},
  {id:31,name:"Oishi Eaterium",type:"ชาบู/บาร์บีคิว/บุฟเฟต์",floor:"B",zone:"โซน B",price:"พรีเมียม",rating:4.1,recommended:["บุฟเฟต์ชาบู-ยากินิกุ","ซูชิหน้าปลาแซลมอน"],hours:"11:00 - 21:30",tags:["บุฟเฟต์คุ้มค่า","บรรยากาศดี"],contact:"02-958-4031",delivery:["Grab","Robinhood"],pax:["2-4","5+"],isNew:false},
  {id:32,name:"Momo Paradise",type:"ชาบู/บาร์บีคิว/บุฟเฟต์",floor:"2",zone:"โซน Zpell ชั้น 2",price:"พรีเมียม",rating:4.4,recommended:["สุกี้ยากี้ญี่ปุ่นพรีเมียม","ไข่ออนเซ็น"],hours:"11:00 - 21:30",tags:["สุกี้ญี่ปุ่นพรีเมียม","New"],contact:"02-958-4032",delivery:["Grab"],pax:["2-4","5+"],isNew:true},
  {id:33,name:"AKA Japanese Restaurant",type:"ชาบู/บาร์บีคิว/บุฟเฟต์",floor:"B",zone:"โซน B",price:"พรีเมียม",rating:4.0,recommended:["บุฟเฟต์ปิ้งย่างญี่ปุ่น","เนื้อวากิว"],hours:"11:00 - 21:30",tags:["บุฟเฟต์เนื้อพรีเมียม"],contact:"02-958-4033",delivery:["Grab"],pax:["2-4","5+"],isNew:false},
  {id:34,name:"McDonald's",type:"ฟาสต์ฟู้ด",floor:"G",zone:"โซนฟู้ดคอร์ท ชั้น G",price:"ถูก",rating:4.0,recommended:["บิ๊กแมค","แมคนักเก็ต","เฟรนช์ฟรายส์"],hours:"07:00 - 22:00",tags:["เด็กชอบ","เร็วทันใจ"],contact:"02-958-4034",delivery:["Grab","Lineman","Robinhood"],pax:["solo","2-4"],isNew:false},
  {id:35,name:"KFC",type:"ฟาสต์ฟู้ด",floor:"G",zone:"โซนฟู้ดคอร์ท ชั้น G",price:"ถูก",rating:3.9,recommended:["ไก่ทอดต้นตำรับ","เบอร์เกอร์ไก่","มันบด"],hours:"07:00 - 22:00",tags:["เร็วทันใจ"],contact:"02-958-4035",delivery:["Grab","Lineman"],pax:["solo","2-4"],isNew:false},
  {id:36,name:"Subway",type:"ฟาสต์ฟู้ด",floor:"G",zone:"โซนฟู้ดคอร์ท ชั้น G",price:"ถูก",rating:3.8,recommended:["แซนด์วิชทูน่า","แซนด์วิชไก่ย่าง"],hours:"08:00 - 21:00",tags:["เพื่อสุขภาพ"],contact:"02-958-4036",delivery:["Grab","Lineman"],pax:["solo"],isNew:false},
  {id:37,name:"Mono+Mono",type:"ฟาสต์ฟู้ด",floor:"2",zone:"โซน 2",price:"ถูก",rating:3.9,recommended:["ไก่ทอดเกาหลีสไตล์อเมริกัน","เฟรนช์ฟรายส์ชีส"],hours:"10:30 - 21:00",tags:["เร็วทันใจ"],contact:"02-958-4037",delivery:["Grab","Lineman"],pax:["solo","2-4"],isNew:false},
  {id:38,name:"Kuay Teow Rua Witsawa",type:"ก๋วยเตี๋ยว",floor:"B",zone:"โซน B",price:"ถูก",rating:4.2,recommended:["ก๋วยเตี๋ยวเรือหมู","เกาเหลาเนื้อตุ๋น"],hours:"09:30 - 20:30",tags:["น้ำซุปเข้มข้น"],contact:"02-958-4038",delivery:["Lineman"],pax:["solo","2-4"],isNew:false},
  {id:39,name:"Gin Tiew Gun",type:"ก๋วยเตี๋ยว",floor:"B",zone:"โซน B",price:"ถูก",rating:4.0,recommended:["ก๋วยเตี๋ยวต้มยำ","เกี๊ยวทอด"],hours:"10:00 - 20:00",tags:["รสจัดจ้าน"],contact:"02-958-4039",delivery:["Lineman","Robinhood"],pax:["solo"],isNew:false},
  {id:40,name:"ThaiThai Boat Noodles",type:"ก๋วยเตี๋ยว",floor:"2",zone:"โซน 2",price:"ถูก",rating:4.1,recommended:["ก๋วยเตี๋ยวเรือรสจัด","หมูปิ้ง"],hours:"10:00 - 20:30",tags:["สูตรดั้งเดิม"],contact:"02-958-4040",delivery:["Grab","Lineman"],pax:["solo","2-4"],isNew:false},
  {id:41,name:"After You Dessert Cafe",type:"คาเฟ่/ของหวาน",floor:"2",zone:"โซน 2",price:"ปานกลาง",rating:4.5,recommended:["ชิบูย่าฮันนี่โทสต์","แพนเค้กนมสด","เครปเค้ก"],hours:"10:30 - 21:30",tags:["ของหวานยอดฮิต","คิวเยอะช่วงเย็น"],contact:"02-958-4041",delivery:["Grab","Lineman","Robinhood"],pax:["solo","2-4"],isNew:false},
  {id:42,name:"Starbucks",type:"คาเฟ่/ของหวาน",floor:"1",zone:"โซน Robinson ชั้น 1",price:"ปานกลาง",rating:4.2,recommended:["คาราเมลมัคคิอาโต้","ชีสเค้ก"],hours:"07:00 - 21:30",tags:["ที่นั่งทำงานดี"],contact:"02-958-4042",delivery:["Grab"],pax:["solo","2-4"],isNew:false},
  {id:43,name:"Bearhouse Dessert & Milk Tea",type:"คาเฟ่/ของหวาน",floor:"2",zone:"โซน 2",price:"ปานกลาง",rating:4.3,recommended:["ชานมไข่มุกครีมสด","ทาร์ตไข่"],hours:"10:30 - 21:00",tags:["คิวเยอะช่วงเย็น","New"],contact:"02-958-4043",delivery:["Grab","Lineman"],pax:["solo","2-4"],isNew:true},
  {id:44,name:"Fire Tiger Dessert Cafe",type:"คาเฟ่/ของหวาน",floor:"2",zone:"โซน 2",price:"ปานกลาง",rating:4.1,recommended:["ชาผลไม้ท็อปครีมชีส","เค้กช็อกโกแลต"],hours:"10:30 - 21:00",tags:["ถ่ายรูปสวย"],contact:"02-958-4044",delivery:["Grab"],pax:["solo","2-4"],isNew:false},
  {id:45,name:"On the Table Tokyo Cafe",type:"คาเฟ่/ของหวาน",floor:"2",zone:"โซน 2",price:"ปานกลาง",rating:4.0,recommended:["พาสต้าสไตล์ญี่ปุ่น","เครปญี่ปุ่น"],hours:"10:00 - 21:00",tags:["ฟิวชั่นญี่ปุ่น-อิตาเลียน"],contact:"02-958-4045",delivery:["Grab"],pax:["solo","2-4"],isNew:false},
  {id:46,name:"Salad Factory",type:"คาเฟ่/ของหวาน",floor:"2",zone:"โซน 2",price:"ปานกลาง",rating:4.0,recommended:["สลัดอกไก่ย่าง","สมูทตี้โบวล์"],hours:"09:00 - 21:00",tags:["เพื่อสุขภาพ"],contact:"02-958-4046",delivery:["Grab","Lineman","Robinhood"],pax:["solo"],isNew:false},
  {id:47,name:"แมนดาริน สุกี้&ติ่มซำ",type:"ฮาลาล",floor:"2",zone:"โซน Robinson ชั้น 2",price:"ปานกลาง",rating:4.2,recommended:["สุกี้ฮาลาล","ติ่มซำฮาลาล"],hours:"10:00 - 21:00",tags:["อาหารฮาลาล 100%"],contact:"02-958-4047",delivery:["Grab","Lineman"],pax:["2-4","5+"],isNew:false},
  {id:48,name:"เซียนเตี๋ยว",type:"ฮาลาล",floor:"2",zone:"The Popsination ชั้น 2 (เหนือโรบินสัน)",price:"ถูก",rating:4.1,recommended:["ก๋วยเตี๋ยวฮาลาล","เกาเหลาฮาลาล"],hours:"10:00 - 20:30",tags:["อาหารฮาลาล 100%","New"],contact:"02-958-4048",delivery:["Lineman"],pax:["solo","2-4"],isNew:true},
  {id:49,name:"บ้านไก่ทอด ฮาลาล",type:"ฮาลาล",floor:"G",zone:"โซนฟู้ดคอร์ท ชั้น G",price:"ถูก",rating:4.0,recommended:["ไก่ทอดฮาลาล","ข้าวหมกไก่","ชาชักฮาลาล"],hours:"10:00 - 20:00",tags:["อาหารฮาลาล 100%"],contact:"02-958-4049",delivery:["Grab","Lineman"],pax:["solo","2-4"],isNew:false}
];

/* ================= DB INIT ================= */
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      floor TEXT NOT NULL,
      zone TEXT NOT NULL,
      price TEXT NOT NULL,
      rating NUMERIC NOT NULL,
      recommended JSONB NOT NULL DEFAULT '[]',
      hours TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]',
      contact TEXT,
      delivery JSONB NOT NULL DEFAULT '[]',
      pax JSONB NOT NULL DEFAULT '[]',
      is_new BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      name TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      email TEXT,
      age TEXT,
      birthdate DATE,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS birthdate DATE;
    CREATE TABLE IF NOT EXISTS favorites (
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      PRIMARY KEY (username, restaurant_id)
    );
    CREATE TABLE IF NOT EXISTS spin_history (
      id SERIAL PRIMARY KEY,
      username TEXT,
      visitor_id TEXT,
      restaurant_id INTEGER,
      restaurant_name TEXT NOT NULL,
      spun_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE spin_history ADD COLUMN IF NOT EXISTS visitor_id TEXT;
    CREATE TABLE IF NOT EXISTS visit_log (
      id SERIAL PRIMARY KEY,
      username TEXT,
      visitor_id TEXT,
      restaurant_id INTEGER,
      restaurant_name TEXT NOT NULL,
      action TEXT NOT NULL,
      visited_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE visit_log ADD COLUMN IF NOT EXISTS visitor_id TEXT;
    CREATE TABLE IF NOT EXISTS respin_log (
      id SERIAL PRIMARY KEY,
      username TEXT,
      visitor_id TEXT,
      restaurant_id INTEGER,
      restaurant_name TEXT NOT NULL,
      respun_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE respin_log ADD COLUMN IF NOT EXISTS visitor_id TEXT;
    CREATE TABLE IF NOT EXISTS search_log (
      id SERIAL PRIMARY KEY,
      username TEXT,
      visitor_id TEXT,
      term TEXT NOT NULL,
      searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE search_log ADD COLUMN IF NOT EXISTS visitor_id TEXT;
    CREATE TABLE IF NOT EXISTS visitors (
      visitor_id TEXT PRIMARY KEY,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'improvement',
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE feedback ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'improvement';
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      username TEXT,
      restaurant_id INTEGER,
      restaurant_name TEXT NOT NULL,
      booking_date DATE NOT NULL,
      booking_time TEXT NOT NULL,
      pax INTEGER NOT NULL,
      booker_name TEXT NOT NULL,
      booker_phone TEXT NOT NULL,
      reference_code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await seedRestaurants();
  await seedUsers();
}

// Idempotent — safe to call on every boot or on demand. Uses ON CONFLICT DO NOTHING
// so it only ever backfills missing rows, never touches existing/edited data.
async function seedRestaurants() {
  for (const r of SEED_RESTAURANTS) {
    await pool.query(
      `INSERT INTO restaurants (id,name,type,floor,zone,price,rating,recommended,hours,tags,contact,delivery,pax,is_new)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO NOTHING`,
      [r.id, r.name, r.type, r.floor, r.zone, r.price, r.rating, JSON.stringify(r.recommended), r.hours, JSON.stringify(r.tags), r.contact, JSON.stringify(r.delivery), JSON.stringify(r.pax), r.isNew]
    );
  }
  await pool.query("SELECT setval(pg_get_serial_sequence('restaurants','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM restaurants), 1))");
}

async function seedUsers() {
  const adminHash = await bcrypt.hash("admin", 10);
  const userHash = await bcrypt.hash("user", 10);
  await pool.query(
    `INSERT INTO users (username,password_hash,role,name,first_name,last_name,phone,email,age)
     VALUES ('admin',$1,'admin','Admin',NULL,NULL,NULL,NULL,NULL)
     ON CONFLICT (username) DO NOTHING`,
    [adminHash]
  );
  await pool.query(
    `INSERT INTO users (username,password_hash,role,name,first_name,last_name,phone,email,age)
     VALUES ('user',$1,'user','คุณผู้ใช้','คุณ','ผู้ใช้','081-000-0000','user@example.com','25')
     ON CONFLICT (username) DO NOTHING`,
    [userHash]
  );
}

function mapRestaurant(row) {
  return {
    id: row.id, name: row.name, type: row.type, floor: row.floor, zone: row.zone,
    price: row.price, rating: parseFloat(row.rating), recommended: row.recommended,
    hours: row.hours, tags: row.tags, contact: row.contact, delivery: row.delivery,
    pax: row.pax, isNew: row.is_new
  };
}
function mapUserPublic(row) {
  return {
    username: row.username, role: row.role, name: row.name,
    firstName: row.first_name || "", lastName: row.last_name || "",
    phone: row.phone || "", email: row.email || "", age: row.age || "",
    birthdate: row.birthdate || null,
    registeredAt: row.registered_at
  };
}

/* ================= REAL-TIME ACTIVE USERS (in-memory, no DB needed) ================= */
const ACTIVE_VISITORS = new Map(); // visitorId -> last heartbeat (ms)
const ACTIVE_WINDOW_MS = 90 * 1000; // no heartbeat in this long = considered gone

app.post("/api/heartbeat", (req, res) => {
  const { visitorId } = req.body || {};
  if (visitorId) {
    ACTIVE_VISITORS.set(visitorId, Date.now());
    if (pool) {
      pool.query(
        `INSERT INTO visitors (visitor_id, first_seen, last_seen) VALUES ($1, now(), now())
         ON CONFLICT (visitor_id) DO UPDATE SET last_seen = now()`,
        [visitorId]
      ).catch(e => console.error("heartbeat db write failed:", e.message));
    }
  }
  res.json({ ok: true });
});

app.get("/api/active-users", (req, res) => {
  const now = Date.now();
  let count = 0;
  for (const [id, ts] of ACTIVE_VISITORS) {
    if (now - ts <= ACTIVE_WINDOW_MS) count++;
    else ACTIVE_VISITORS.delete(id);
  }
  res.json({ activeNow: count });
});

/* ================= MIDDLEWARE ================= */
function requireDb(req, res, next) {
  if (!pool) return res.status(503).json({ error: "ยังไม่ได้ตั้งค่าฐานข้อมูล (DATABASE_URL) กรุณาเพิ่ม PostgreSQL ใน Railway แล้ว deploy ใหม่" });
  next();
}
app.use("/api", requireDb);

/* ================= RESTAURANTS ================= */
app.get("/api/restaurants", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM restaurants ORDER BY id ASC");
    res.json(rows.map(mapRestaurant));
  } catch (e) { console.error(e); res.status(500).json({ error: "โหลดข้อมูลร้านไม่สำเร็จ" }); }
});

app.post("/api/restaurants", requireAdmin, async (req, res) => {
  try {
    const r = req.body;
    const { rows } = await pool.query(
      `INSERT INTO restaurants (name,type,floor,zone,price,rating,recommended,hours,tags,contact,delivery,pax,is_new)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [r.name, r.type, r.floor, r.zone, r.price, r.rating, JSON.stringify(r.recommended || []), r.hours, JSON.stringify(r.tags || []), r.contact, JSON.stringify(r.delivery || []), JSON.stringify(r.pax || []), !!r.isNew]
    );
    res.json(mapRestaurant(rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: "เพิ่มร้านไม่สำเร็จ" }); }
});

app.put("/api/restaurants/:id", requireAdmin, async (req, res) => {
  try {
    const r = req.body;
    const { rows } = await pool.query(
      `UPDATE restaurants SET name=$1,type=$2,floor=$3,zone=$4,price=$5,rating=$6,recommended=$7,hours=$8,tags=$9,contact=$10,delivery=$11,pax=$12,is_new=$13
       WHERE id=$14 RETURNING *`,
      [r.name, r.type, r.floor, r.zone, r.price, r.rating, JSON.stringify(r.recommended || []), r.hours, JSON.stringify(r.tags || []), r.contact, JSON.stringify(r.delivery || []), JSON.stringify(r.pax || []), !!r.isNew, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "ไม่พบร้านนี้" });
    res.json(mapRestaurant(rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: "แก้ไขร้านไม่สำเร็จ" }); }
});

app.delete("/api/restaurants/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM restaurants WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "ลบร้านไม่สำเร็จ" }); }
});

// Backfills the 49 seed restaurants + admin/user mock accounts if missing.
// Safe to call anytime — only inserts rows that don't already exist.
app.post("/api/admin/reseed", requireAdmin, async (req, res) => {
  try {
    await seedRestaurants();
    await seedUsers();
    const { rows } = await pool.query("SELECT COUNT(*) FROM restaurants");
    res.json({ ok: true, restaurantCount: parseInt(rows[0].count, 10) });
  } catch (e) { console.error(e); res.status(500).json({ error: "เติมข้อมูลไม่สำเร็จ: " + e.message }); }
});

/* ================= AUTH ================= */
app.post("/api/register", async (req, res) => {
  try {
    const { firstName, lastName, phone, email, age, birthdate, username, password } = req.body;
    if (!firstName || !lastName || !phone || !email || !age || !birthdate || !username || !password) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "รูปแบบอีเมลไม่ถูกต้อง" });
    }
    const { rows: existing } = await pool.query("SELECT username FROM users WHERE username=$1", [username]);
    if (existing.length) return res.status(409).json({ error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น" });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username,password_hash,role,name,first_name,last_name,phone,email,age,birthdate)
       VALUES ($1,$2,'user',$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [username, hash, firstName + " " + lastName, firstName, lastName, phone, email, age, birthdate]
    );
    const token = issueToken(rows[0].username, rows[0].role);
    res.json(Object.assign(mapUserPublic(rows[0]), { token }));
  } catch (e) { console.error(e); res.status(500).json({ error: "สมัครสมาชิกไม่สำเร็จ" }); }
});

app.post("/api/reset-password", async (req, res) => {
  try {
    const { username, birthdate, newPassword } = req.body;
    if (!username || !birthdate || !newPassword) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: "รหัสผ่านใหม่สั้นเกินไป" });
    }
    const { rows } = await pool.query("SELECT username, birthdate FROM users WHERE username=$1", [username]);
    const genericError = { error: "ชื่อผู้ใช้หรือวันเดือนปีเกิดไม่ถูกต้อง" };
    if (!rows.length || !rows[0].birthdate) return res.status(401).json(genericError);
    const onFile = new Date(rows[0].birthdate).toISOString().slice(0, 10);
    if (onFile !== birthdate) return res.status(401).json(genericError);

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash=$1 WHERE username=$2", [hash, username]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "รีเซ็ตรหัสผ่านไม่สำเร็จ" }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    if (!rows.length) return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    const ok = await bcrypt.compare(password || "", rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    const token = issueToken(rows[0].username, rows[0].role);
    res.json(Object.assign(mapUserPublic(rows[0]), { token }));
  } catch (e) { console.error(e); res.status(500).json({ error: "เข้าสู่ระบบไม่สำเร็จ" }); }
});

app.post("/api/logout", requireAuth, (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) SESSIONS.delete(token);
  res.json({ ok: true });
});

// Used to restore a session after a page refresh (client keeps the token, this verifies it's still valid).
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE username=$1", [req.authUser.username]);
    if (!rows.length) return res.status(404).json({ error: "ไม่พบผู้ใช้นี้" });
    res.json(mapUserPublic(rows[0]));
  } catch (e) { console.error(e); res.status(500).json({ error: "โหลดข้อมูลผู้ใช้ไม่สำเร็จ" }); }
});

/* ================= FAVORITES ================= */
app.get("/api/favorites/:username", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT restaurant_id FROM favorites WHERE username=$1", [req.params.username]);
    res.json(rows.map(r => r.restaurant_id));
  } catch (e) { console.error(e); res.status(500).json({ error: "โหลดรายการโปรดไม่สำเร็จ" }); }
});

app.post("/api/favorites/toggle", async (req, res) => {
  try {
    const { username, restaurantId } = req.body;
    const { rows } = await pool.query("SELECT 1 FROM favorites WHERE username=$1 AND restaurant_id=$2", [username, restaurantId]);
    if (rows.length) {
      await pool.query("DELETE FROM favorites WHERE username=$1 AND restaurant_id=$2", [username, restaurantId]);
      return res.json({ favorited: false });
    }
    await pool.query("INSERT INTO favorites (username,restaurant_id) VALUES ($1,$2)", [username, restaurantId]);
    res.json({ favorited: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "บันทึกรายการโปรดไม่สำเร็จ" }); }
});

/* ================= ACTIVITY LOGGING ================= */
app.post("/api/activity/spin", async (req, res) => {
  try {
    const { username, visitorId, restaurantId, restaurantName } = req.body;
    await pool.query("INSERT INTO spin_history (username,visitor_id,restaurant_id,restaurant_name) VALUES ($1,$2,$3,$4)", [username || null, visitorId || null, restaurantId, restaurantName]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "บันทึกการสุ่มไม่สำเร็จ" }); }
});
app.post("/api/activity/visit", async (req, res) => {
  try {
    const { username, visitorId, restaurantId, restaurantName, action } = req.body;
    await pool.query("INSERT INTO visit_log (username,visitor_id,restaurant_id,restaurant_name,action) VALUES ($1,$2,$3,$4,$5)", [username || null, visitorId || null, restaurantId, restaurantName, action]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "บันทึกการใช้บริการไม่สำเร็จ" }); }
});
app.post("/api/activity/respin", async (req, res) => {
  try {
    const { username, visitorId, restaurantId, restaurantName } = req.body;
    await pool.query("INSERT INTO respin_log (username,visitor_id,restaurant_id,restaurant_name) VALUES ($1,$2,$3,$4)", [username || null, visitorId || null, restaurantId, restaurantName]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "บันทึกการสุ่มใหม่ไม่สำเร็จ" }); }
});
app.post("/api/activity/search", async (req, res) => {
  try {
    const { username, visitorId, term } = req.body;
    if (term) await pool.query("INSERT INTO search_log (username,visitor_id,term) VALUES ($1,$2,$3)", [username || null, visitorId || null, term]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "บันทึกการค้นหาไม่สำเร็จ" }); }
});

/* ================= FEEDBACK (admin-only visibility) ================= */
const FEEDBACK_TYPES = ["good", "bad", "improvement"];
app.post("/api/feedback", requireAuth, async (req, res) => {
  try {
    const message = (req.body.message || "").trim();
    const type = FEEDBACK_TYPES.includes(req.body.type) ? req.body.type : null;
    if (!message) return res.status(400).json({ error: "กรุณากรอกข้อความ" });
    if (!type) return res.status(400).json({ error: "กรุณาเลือกประเภทความคิดเห็น" });
    await pool.query("INSERT INTO feedback (username,type,message) VALUES ($1,$2,$3)", [req.authUser.username, type, message]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "ส่งความคิดเห็นไม่สำเร็จ" }); }
});

app.get("/api/feedback", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.id, f.username, u.name AS user_name, f.type, f.message, f.created_at
      FROM feedback f LEFT JOIN users u ON u.username = f.username
      ORDER BY f.created_at DESC LIMIT 200
    `);
    res.json(rows.map(r => ({ id: r.id, username: r.username, name: r.user_name || r.username, type: r.type, message: r.message, time: r.created_at })));
  } catch (e) { console.error(e); res.status(500).json({ error: "โหลดความคิดเห็นไม่สำเร็จ" }); }
});

/* ================= RESTAURANT REVIEWS (public) ================= */
app.get("/api/restaurants/:id/reviews", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT rv.id, rv.username, u.name AS user_name, rv.rating, rv.comment, rv.created_at
      FROM reviews rv LEFT JOIN users u ON u.username = rv.username
      WHERE rv.restaurant_id=$1 ORDER BY rv.created_at DESC LIMIT 100
    `, [req.params.id]);
    const { rows: avgRows } = await pool.query("SELECT AVG(rating)::float AS avg, COUNT(*) AS count FROM reviews WHERE restaurant_id=$1", [req.params.id]);
    res.json({
      reviews: rows.map(r => ({ id: r.id, username: r.username, name: r.user_name || r.username, rating: r.rating, comment: r.comment, time: r.created_at })),
      average: avgRows[0].avg ? Math.round(avgRows[0].avg * 10) / 10 : null,
      count: parseInt(avgRows[0].count, 10)
    });
  } catch (e) { console.error(e); res.status(500).json({ error: "โหลดรีวิวไม่สำเร็จ" }); }
});

app.post("/api/restaurants/:id/reviews", requireAuth, async (req, res) => {
  try {
    const rating = parseInt(req.body.rating, 10);
    const comment = (req.body.comment || "").trim();
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "กรุณาให้คะแนน 1-5 ดาว" });
    await pool.query(
      "INSERT INTO reviews (restaurant_id,username,rating,comment) VALUES ($1,$2,$3,$4)",
      [req.params.id, req.authUser.username, rating, comment || null]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "ส่งรีวิวไม่สำเร็จ" }); }
});

/* ================= BOOKINGS ================= */
app.post("/api/bookings", optionalAuth, async (req, res) => {
  try {
    const { restaurantId, restaurantName, date, time, pax, name, phone, ref } = req.body;
    if (!restaurantName || !date || !time || !pax || !name || !phone || !ref) {
      return res.status(400).json({ error: "ข้อมูลการจองไม่ครบถ้วน" });
    }
    await pool.query(
      `INSERT INTO bookings (username,restaurant_id,restaurant_name,booking_date,booking_time,pax,booker_name,booker_phone,reference_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.authUser ? req.authUser.username : null, restaurantId || null, restaurantName, date, time, pax, name, phone, ref]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "บันทึกการจองไม่สำเร็จ" }); }
});

/* ================= PER-USER ACTIVITY (profile / admin customer detail) ================= */
app.get("/api/users/:username/activity", requireAuth, async (req, res) => {
  try {
    const username = req.params.username;
    if (req.authUser.username !== username && req.authUser.role !== "admin") {
      return res.status(403).json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" });
    }
    const { rows: userRows } = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    if (!userRows.length) return res.status(404).json({ error: "ไม่พบผู้ใช้นี้" });

    const { rows: favIds } = await pool.query("SELECT restaurant_id FROM favorites WHERE username=$1", [username]);
    const { rows: rest } = await pool.query("SELECT * FROM restaurants WHERE id = ANY($1::int[])", [favIds.map(f => f.restaurant_id)]);
    const { rows: spins } = await pool.query("SELECT restaurant_id AS id, restaurant_name AS name, spun_at AS time FROM spin_history WHERE username=$1 ORDER BY spun_at DESC LIMIT 100", [username]);
    const { rows: visits } = await pool.query("SELECT restaurant_id AS id, restaurant_name AS name, action, visited_at AS time FROM visit_log WHERE username=$1 ORDER BY visited_at DESC LIMIT 200", [username]);
    const { rows: respins } = await pool.query("SELECT restaurant_id AS id, restaurant_name AS name, respun_at AS time FROM respin_log WHERE username=$1 ORDER BY respun_at DESC LIMIT 200", [username]);
    const { rows: bookings } = await pool.query(
      `SELECT restaurant_id AS id, restaurant_name AS name, booking_date AS date, booking_time AS time,
              pax, booker_name AS "bookerName", booker_phone AS "bookerPhone", reference_code AS ref, created_at AS "createdAt"
       FROM bookings WHERE username=$1 ORDER BY created_at DESC LIMIT 100`,
      [username]
    );

    res.json({
      user: mapUserPublic(userRows[0]),
      favorites: rest.map(mapRestaurant),
      spinHistory: spins,
      visitLog: visits,
      respinLog: respins,
      bookings: bookings
    });
  } catch (e) { console.error(e); res.status(500).json({ error: "โหลดข้อมูลผู้ใช้ไม่สำเร็จ" }); }
});

/* ================= ADMIN: CUSTOMERS ================= */
app.get("/api/users", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.*,
        (SELECT COUNT(*) FROM favorites f WHERE f.username=u.username) AS fav_count,
        (SELECT COUNT(*) FROM spin_history s WHERE s.username=u.username) AS spin_count
      FROM users u ORDER BY u.registered_at ASC
    `);
    res.json(rows.map(r => Object.assign(mapUserPublic(r), { favCount: parseInt(r.fav_count, 10), spinCount: parseInt(r.spin_count, 10) })));
  } catch (e) { console.error(e); res.status(500).json({ error: "โหลดรายชื่อลูกค้าไม่สำเร็จ" }); }
});

/* ================= ADMIN: ANALYTICS ================= */
app.get("/api/analytics", requireAdmin, async (req, res) => {
  try {
    const { rows: userCountRows } = await pool.query("SELECT COUNT(*) FROM users");
    const { rows: favCountRows } = await pool.query("SELECT COUNT(*) FROM favorites");
    const { rows: spins } = await pool.query("SELECT restaurant_id AS id, restaurant_name AS name, spun_at AS time FROM spin_history ORDER BY spun_at DESC LIMIT 500");
    const { rows: visits } = await pool.query("SELECT restaurant_id AS id, restaurant_name AS name, action, visited_at AS time FROM visit_log ORDER BY visited_at DESC LIMIT 1000");
    const { rows: respins } = await pool.query("SELECT restaurant_id AS id, restaurant_name AS name, respun_at AS time FROM respin_log ORDER BY respun_at DESC LIMIT 1000");
    const { rows: searches } = await pool.query("SELECT term, searched_at AS time FROM search_log ORDER BY searched_at DESC LIMIT 50");
    const { rows: topFavorited } = await pool.query(`
      SELECT r.name AS name, COUNT(f.username) AS count
      FROM favorites f JOIN restaurants r ON r.id = f.restaurant_id
      GROUP BY r.id, r.name
      ORDER BY count DESC
      LIMIT 10
    `);
    const { rows: searchCountRows } = await pool.query("SELECT COUNT(*) FROM search_log");
    const { rows: topSearches } = await pool.query(`
      SELECT LOWER(TRIM(term)) AS term, COUNT(*) AS count
      FROM search_log
      WHERE term IS NOT NULL AND TRIM(term) <> ''
      GROUP BY LOWER(TRIM(term))
      ORDER BY count DESC
      LIMIT 10
    `);
    const { rows: funnelRows } = await pool.query(`
      WITH activity_visitor_ids AS (
        SELECT DISTINCT visitor_id FROM spin_history WHERE visitor_id IS NOT NULL
        UNION SELECT DISTINCT visitor_id FROM visit_log WHERE visitor_id IS NOT NULL
        UNION SELECT DISTINCT visitor_id FROM respin_log WHERE visitor_id IS NOT NULL
      ),
      guest_activity_visitor_ids AS (
        SELECT DISTINCT visitor_id FROM spin_history WHERE visitor_id IS NOT NULL AND username IS NULL
        UNION SELECT DISTINCT visitor_id FROM visit_log WHERE visitor_id IS NOT NULL AND username IS NULL
        UNION SELECT DISTINCT visitor_id FROM respin_log WHERE visitor_id IS NOT NULL AND username IS NULL
      )
      SELECT
        (SELECT COUNT(*) FROM visitors) AS total_visitors,
        (SELECT COUNT(*) FROM activity_visitor_ids) AS used_service_visitors,
        (SELECT COUNT(*) FROM guest_activity_visitor_ids) AS guest_used_service_visitors
    `);
    const fr = funnelRows[0];
    const totalVisitors = parseInt(fr.total_visitors, 10);
    const usedServiceVisitors = parseInt(fr.used_service_visitors, 10);
    res.json({
      totalUsers: parseInt(userCountRows[0].count, 10),
      totalFavorites: parseInt(favCountRows[0].count, 10),
      spinHistory: spins,
      visitLog: visits,
      respinLog: respins,
      searchLog: searches,
      topFavorited: topFavorited.map(r => ({ name: r.name, count: parseInt(r.count, 10) })),
      totalSearches: parseInt(searchCountRows[0].count, 10),
      topSearches: topSearches.map(r => ({ term: r.term, count: parseInt(r.count, 10) })),
      visitorFunnel: {
        totalVisitors,
        visitedNoService: Math.max(0, totalVisitors - usedServiceVisitors),
        usedServiceNoAccount: parseInt(fr.guest_used_service_visitors, 10)
      }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: "โหลดสถิติไม่สำเร็จ" }); }
});

/* ================= STATIC FRONTEND ================= */
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;
async function start() {
  if (pool) {
    try {
      await initDb();
      console.log("Database ready.");
    } catch (e) {
      console.error("Database init failed:", e.message);
    }
  } else {
    console.warn("DATABASE_URL not set — /api routes will return 503 until a PostgreSQL database is attached.");
  }
  app.listen(PORT, () => console.log("Server listening on port " + PORT));
}
start();
