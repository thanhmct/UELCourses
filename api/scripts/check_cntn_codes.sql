-- Đối chiếu danh sách môn tiếng Anh thuộc chương trình Cử nhân tài năng (CNTN) do chủ dự án cung cấp ngày 2026-11-21.
with listed(code) as (values
 ('ERBT039'),('ERBT040'),('EUUT071'),('EUUT072'),('EUUT073'),('EUUT082'),('EUUT101'),('EUUT102'),('EUUT103'),('EUUT151'),
 ('EUUT152'),('EUUT153'),('EFFT071'),('EIET043'),('EIMT022'),('EIMT049'),('EKBT016'),('EKBT020'),('EKBT021'),('EKTT017'),
 ('EKTT023'),('EKTT048'),('EKTT067'),('ELCT014'),('ELCT046'),('EAAT027'),('EAUT028'),('EBBT068'),('EBMT065'))
select 'trong DB' as what, count(*) from listed l join modules m on m.code = l.code
union all select 'không có trong DB', count(*) from listed l where not exists (select 1 from modules m where m.code = l.code)
union all select 'mã dạng E+2 chữ+T+số trong DB', count(*) from modules where code ~ '^E[A-Z]{2}T[0-9]'
union all select '...trong đó KHÔNG nằm trong danh sách', count(*) from modules m where m.code ~ '^E[A-Z]{2}T[0-9]' and not exists (select 1 from listed l where l.code = m.code)
union all select 'tên có CNTN', count(*) from modules where name ilike '%CNTN%'
union all select 'tên có CNTN nhưng KHÔNG nằm trong danh sách', count(*) from modules m where name ilike '%CNTN%' and not exists (select 1 from listed l where l.code = m.code);

-- chi tiết các mã trong danh sách: tên, căn cứ phân loại hiện tại, số lớp đã mở
select m.code, left(m.name, 52) as name, m.language_track, m.language_basis, (select count(*) from class_sections c where c.module_code = m.code) as classes
from modules m where m.code in ('ERBT039','ERBT040','EUUT071','EUUT072','EUUT073','EUUT082','EUUT101','EUUT102','EUUT103','EUUT151','EUUT152','EUUT153','EFFT071','EIET043','EIMT022','EIMT049','EKBT016','EKBT020','EKBT021','EKTT017','EKTT023','EKTT048','EKTT067','ELCT014','ELCT046','EAAT027','EAUT028','EBBT068','EBMT065')
order by m.code limit 40;

-- các mã E-cũ còn lại KHÔNG thuộc danh sách (vẫn đang gắn legacy_e_code) — nhóm này mới cần rà soát tiếp
select left(code, 2) as prefix2, count(*) from modules where language_basis = 'legacy_e_code' and code !~ '^E[A-Z]{2}T[0-9]' group by 1 order by 2 desc;
