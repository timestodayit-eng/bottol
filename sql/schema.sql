-- Import through Hostinger phpMyAdmin into the database selected in hPanel.
-- MySQL 8.0+ / utf8mb4, InnoDB. No CREATE DATABASE statement is required.
CREATE TABLE IF NOT EXISTS staff (
 id CHAR(36) PRIMARY KEY, email VARCHAR(190) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('super_admin','ads_manager','analyst') NOT NULL DEFAULT 'analyst',
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS ad_accounts (
 id CHAR(36) PRIMARY KEY, slot TINYINT UNSIGNED NOT NULL UNIQUE,
 label VARCHAR(200) NOT NULL,meta_account_id VARCHAR(80) UNIQUE,meta_account_name VARCHAR(200),
 daily_budget DECIMAL(12,2) NOT NULL DEFAULT 2500.00,
 audience_note TEXT NOT NULL,phone VARCHAR(30) NOT NULL DEFAULT '01958044480',
 start_date DATE NOT NULL,end_date DATE NOT NULL,selected BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT chk_slot CHECK (slot BETWEEN 1 AND 10),CONSTRAINT chk_budget CHECK (daily_budget>=0),
 CONSTRAINT chk_dates CHECK(end_date>=start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS videos (
 id CHAR(36) PRIMARY KEY,name VARCHAR(200) NOT NULL,size_bytes BIGINT UNSIGNED NOT NULL,
 mime_type VARCHAR(80) NOT NULL,object_key VARCHAR(500) NOT NULL,
 upload_id VARCHAR(500),status ENUM('uploading','ready','aborted') NOT NULL DEFAULT 'uploading',
 uploaded_by CHAR(36),created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_videos_created(created_at),CONSTRAINT fk_video_staff FOREIGN KEY(uploaded_by) REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS campaign_drafts (
 id CHAR(36) PRIMARY KEY,name VARCHAR(160) NOT NULL,objective VARCHAR(60) NOT NULL,
 special_ad_categories JSON NOT NULL,video_id CHAR(36) NOT NULL,
 caption TEXT NOT NULL,headline VARCHAR(255) NOT NULL,items JSON NOT NULL,
 status ENUM('draft') NOT NULL DEFAULT 'draft',created_by CHAR(36),
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_drafts_created(created_at),
 CONSTRAINT fk_draft_video FOREIGN KEY(video_id) REFERENCES videos(id),
 CONSTRAINT fk_draft_staff FOREIGN KEY(created_by) REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO ad_accounts(id,slot,label,audience_note,phone,start_date,end_date,selected) VALUES
(UUID(),1,'CI Ad Account 01','Bangladesh - eligible Meta targeting only','01958044480',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 7 DAY),1),
(UUID(),2,'CI Ad Account 02','Bangladesh - eligible Meta targeting only','01958044480',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 7 DAY),1),
(UUID(),3,'CI Ad Account 03','Bangladesh - eligible Meta targeting only','01958044480',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 7 DAY),1),
(UUID(),4,'CI Ad Account 04','Bangladesh - eligible Meta targeting only','01958044480',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 7 DAY),1),
(UUID(),5,'CI Ad Account 05','Bangladesh - eligible Meta targeting only','01958044480',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 7 DAY),1),
(UUID(),6,'CI Ad Account 06','Bangladesh - eligible Meta targeting only','01958044480',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 7 DAY),1),
(UUID(),7,'CI Ad Account 07','Bangladesh - eligible Meta targeting only','01958044480',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 7 DAY),1),
(UUID(),8,'CI Ad Account 08','Bangladesh - eligible Meta targeting only','01958044480',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 7 DAY),1),
(UUID(),9,'CI Ad Account 09','Bangladesh - eligible Meta targeting only','01958044480',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 7 DAY),1),
(UUID(),10,'CI Ad Account 10','Bangladesh - eligible Meta targeting only','01958044480',CURRENT_DATE(),DATE_ADD(CURRENT_DATE(),INTERVAL 7 DAY),1);
