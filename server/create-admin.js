// Run privately: npm run create-admin -- admin@example.com 'strong unique password'
import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
const [email,password]=process.argv.slice(2);
if(!email||!password||password.length<14){console.error('Usage: npm run create-admin -- email@example.com "a unique password of at least 14 characters"');process.exit(1)}
const connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME,ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:true}:undefined});
try{const hash=await bcrypt.hash(password,12);await connection.execute("INSERT INTO staff(id,email,password_hash,role,active) VALUES(?,?,?,'super_admin',1)",[randomUUID(),email.trim().toLowerCase(),hash]);console.log('Admin created:',email)}finally{await connection.end()}
