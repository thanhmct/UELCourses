-- 8 tài liệu doc_type='other' (ngẫu nhiên, cố định theo id): 18 dòng đầu có chữ + các dòng trông như đề mục.
with pick as (
  select d.id, d.page_count from outline_documents d join outline_courses c on c.document_id = d.id
  where c.doc_type = 'other' order by (d.id * 7919) % 1000 limit 8
)
select p.id, p.page_count,
       (select string_agg(left(regexp_replace(trim(l), '\s+', ' ', 'g'), 60), ' ¦ ')
          from (select l from unnest(string_to_array((select text from outline_documents where id = p.id), E'\n')) l
                where trim(l) <> '' limit 18) s) as first_lines
from pick p order by p.id;

-- đề mục dạng số La Mã / số / chữ cái ở đầu dòng trong các tài liệu 'other' (tần suất)
select regexp_replace(upper(left(trim(l), 40)), '[0-9]+', 'N', 'g') as heading_shape, count(*) as n
from (select unnest(string_to_array(d.text, E'\n')) l from outline_documents d join outline_courses c on c.document_id = d.id where c.doc_type = 'other') s
where trim(l) ~ '^(([IVX]{1,4}|[0-9]{1,2})[\.\)]|PHẦN|CHƯƠNG|ĐỀ CƯƠNG|SYLLABUS|COURSE|THÔNG TIN|MỤC TIÊU)\s' and length(trim(l)) < 70
group by 1 order by 2 desc limit 25;
