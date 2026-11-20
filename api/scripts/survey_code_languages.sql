-- Khảo sát quy ước mã học phần: môn dạy bằng tiếng Anh (mã bắt đầu bằng E) so với tiếng Việt.
select 'E + 2 chữ + số (EEE1038)'      as pattern, count(*) as modules, count(*) filter (where is_english) as name_has_E
  from modules where code ~ '^E[A-Z]{2}[0-9]'
union all
select 'E khác (EN21, EKT…)',            count(*), count(*) filter (where is_english) from modules where code ~ '^E' and code !~ '^E[A-Z]{2}[0-9]'
union all
select 'không bắt đầu bằng E',            count(*), count(*) filter (where is_english) from modules where code !~ '^E'
union all
select 'tên có (E) nhưng mã KHÔNG bắt đầu E', count(*), count(*) from modules where is_english and code !~ '^E';

-- mã bắt đầu bằng E nhưng KHÔNG khớp mẫu chuẩn (ứng viên ngoại lệ)
select code, name from modules where code ~ '^E' and code !~ '^E[A-Z]{2}[0-9]' order by code limit 25;

-- tiền tố 1 chữ cái của mã (B/E/M/P/…) trên toàn bộ học phần
select left(code, 1) as first_letter, count(*) from modules group by 1 order by 2 desc;

-- cặp tiếng Anh <-> tiếng Việt: EEE1038 <-> BEE1038 (E đầu mã đổi thành B)
select count(*) as pairs_e_to_b from modules e join modules b on b.code = 'B' || substr(e.code, 2) where e.code ~ '^E[A-Z]{2}[0-9]';
