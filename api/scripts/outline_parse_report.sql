-- Báo cáo chất lượng phân tích đề cương (outline_courses). Chạy: psql -f hoặc qua dev.ps1 psql.
\echo '== Loại tài liệu x trạng thái'
select doc_type, parse_status, count(*) from outline_courses group by 1,2 order by 1, 3 desc;

\echo '== Đề cương thật (syllabus_*): có đủ từng phần không'
select count(*) as syllabi,
       count(*) filter (where name_vi is not null or name_en is not null) as has_name,
       count(*) filter (where course_code is not null) as has_code,
       count(*) filter (where credits is not null) as has_credits,
       count(*) filter (where (parse_detail->'counts'->>'objectives')::int > 0) as has_objectives,
       count(*) filter (where (parse_detail->'counts'->>'clos')::int > 0) as has_clos,
       count(*) filter (where (parse_detail->'counts'->>'assessments')::int > 0) as has_assessments,
       count(*) filter (where (parse_detail->'counts'->>'schedule')::int > 0) as has_schedule,
       count(*) filter (where (parse_detail->>'materials')::int > 0) as has_materials,
       count(*) filter (where parse_detail->>'tables_failed' = 'true') as tables_timeout
from outline_courses where doc_type like 'syllabus%';

\echo '== Tài liệu doc_type=other (không nhận ra mẫu) và PDF scan'
select (select count(*) from outline_courses where doc_type = 'other') as other_docs,
       (select count(*) from outline_documents where text_status = 'needs_ocr') as needs_ocr,
       (select count(*) from outline_documents d where d.text_status = 'extracted' and not exists (select 1 from outline_courses c where c.document_id = d.id)) as not_parsed_yet;

\echo '== Đề cương đã liên kết với mã học phần (outline_module_links)'
select count(distinct document_id) as docs_linked, count(*) as links from outline_module_links;
