-- Tác động nếu bỏ các học phần có mã đúng 4 ký tự (mã hệ cũ: EN21, KT48, LU10, TO07, IS28…).
select 'modules mã 4 ký tự' as what, count(*) as n from modules where length(code) = 4
union all select '  ...trong đó có lớp học phần mở', count(distinct m.code) from modules m join class_sections c on c.module_code = m.code where length(m.code) = 4
union all select '  ...số lớp học phần của chúng', count(*) from class_sections c where length(c.module_code) = 4
union all select '  ...số buổi học (lessons) của chúng', count(*) from lessons l join class_sections c on c.id = l.class_id where length(c.module_code) = 4
union all select '  ...dòng trong program_modules', count(*) from program_modules where length(module_code) = 4
union all select '  ...cạnh quan hệ (prereq/previous) có đầu mút mã 4 ký tự', count(*) from module_relations where type in ('prereq','previous') and (length(source) = 4 or length(target) = 4)
union all select '  ...cặp tương đương (equivalents) có mã 4 ký tự', count(*) from equivalents where length(code) = 4 or length(equivalent_code) = 4
union all select '  ...dòng danh mục đề cương 2025 (program_catalog_entries)', count(*) from program_catalog_entries where length(module_code) = 4
union all select '  ...kế hoạch mở (module_offering_plans)', count(*) from module_offering_plans where length(module_code) = 4;

-- lớp học phần của mã 4 ký tự theo học kỳ (còn dùng ở các kỳ gần đây / tương lai không?)
select coalesce(c.semester_id, '(không rõ kỳ)') as semester, count(*) as classes
from class_sections c where length(c.module_code) = 4 group by 1 order by 1;

-- chương trình đào tạo (theo khóa) đang dùng mã 4 ký tự
select p.cohort, count(distinct p.id) as programs, count(*) as rows_in_programs
from program_modules pm join programs p on p.id = pm.program_id where length(pm.module_code) = 4 group by 1 order by 1;

-- mẫu
select code, left(name, 50) as name from modules where length(code) = 4 order by code limit 12;
