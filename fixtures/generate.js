// Generates the .xlsx test fixtures used by the Playwright tests.
// Run with: node fixtures/generate.js
// Output is deterministic (seeded PRNG), so regenerating gives identical data.
const path = require("path");
const XLSX = require("xlsx");

const OUT = __dirname;
const HEADERS = ["BITS ID", "Course", "Total Marks"];

// Small deterministic PRNG (mulberry32) so fixtures are reproducible.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function id(n) {
  return `2023A7PS${String(n).padStart(4, "0")}P`;
}

function write(name, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Marks");
  XLSX.writeFile(wb, path.join(OUT, name));
  console.log(`wrote ${name} (${rows.length - 1} data rows)`);
}

// valid_basic: 2 courses x 20 students, integer marks, includes band edges.
{
  const rand = rng(1);
  const edges = [0, 19, 20, 79, 80, 100];
  const rows = [HEADERS];
  let n = 1;
  for (const course of ["CS F211", "MATH F112"]) {
    for (let i = 0; i < 20; i++) {
      const marks = i < edges.length ? edges[i] : Math.floor(rand() * 101);
      rows.push([id(n++), course, marks]);
    }
  }
  write("valid_basic.xlsx", rows);
}

// valid_second: same shape, different course names (re-upload / stale state).
{
  const rand = rng(2);
  const rows = [HEADERS];
  let n = 500;
  for (const course of ["BIO F110", "ECON F211"]) {
    for (let i = 0; i < 15; i++) rows.push([id(n++), course, Math.floor(rand() * 101)]);
  }
  write("valid_second.xlsx", rows);
}

// decimals: fractional marks around band edges (rounding).
write("decimals.xlsx", [
  HEADERS,
  [id(1), "CS F211", 79.5],  // -> 80 (A)
  [id(2), "CS F211", 80.2],  // -> 80 (A)
  [id(3), "CS F211", 49.49], // -> 49 (C)
  [id(4), "CS F211", 19.5],  // -> 20 (D)
  [id(5), "CS F211", 65],
]);

// brief_headers: the exact header wording used in the challenge brief.
write("brief_headers.xlsx", [
  ["Student's BITS ID", "Course", "Total Marks (out of 100)"],
  [id(1), "CS F211", 85],
  [id(2), "CS F211", 72],
  [id(3), "CS F211", 45],
]);

// messy_headers: case and whitespace variations of the standard headers.
write("messy_headers.xlsx", [
  ["  bits id ", "COURSE", " total MARKS"],
  [id(1), "CS F211", 85],
  [id(2), "CS F211", 55],
]);

// bad_data: one problem per row. Excel row numbers are noted for the tests.
write("bad_data.xlsx", [
  HEADERS,                   // row 1
  [id(1), "CS F211", 70],    // row 2: ok
  [id(2), "CS F211", null],  // row 3: marks missing
  [id(3), "CS F211", "abc"], // row 4: not a number
  [id(4), "CS F211", -5],    // row 5: below 0
  [id(5), "CS F211", 104],   // row 6: above 100
  [id(6), "", 60],           // row 7: course blank
  [null, "CS F211", 60],     // row 8: BITS ID missing
  [id(8), "CS F211", 88],    // row 9: ok
]);

// duplicate_ids: the same student twice in one course (exactly, and with
// different case/spacing). The same ID in a different course is allowed.
write("duplicate_ids.xlsx", [
  HEADERS,                               // row 1
  [id(1), "CS F211", 70],                // row 2
  [id(2), "CS F211", 60],                // row 3
  [id(1), "MATH F112", 50],              // row 4: other course, fine
  [" 2023a7ps0002p ", "CS F211", 55],    // row 5: duplicate of row 3
  [id(3), "CS F211", 40],                // row 6
  [id(1), "CS F211", 90],                // row 7: duplicate of row 2
]);

// cross_course_ids: every student takes both courses (valid, no duplicates).
write("cross_course_ids.xlsx", [
  HEADERS,
  [id(1), "CS F211", 70], [id(2), "CS F211", 45],
  [id(1), "MATH F112", 82], [id(2), "MATH F112", 38],
]);

// missing_column: no marks column at all.
write("missing_column.xlsx", [
  ["BITS ID", "Course", "Remarks"],
  [id(1), "CS F211", "ok"],
]);

// identical_marks: std = 0.
{
  const rows = [HEADERS];
  for (let i = 1; i <= 12; i++) rows.push([id(i), "CS F211", 65]);
  write("identical_marks.xlsx", rows);
}

// large_class: 300 students, roughly normal around 62 (histogram scaling).
{
  const rand = rng(3);
  const rows = [HEADERS];
  for (let i = 1; i <= 300; i++) {
    const z = Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    const marks = Math.max(0, Math.min(100, Math.round(62 + z * 12)));
    rows.push([id(i), "CS F211", marks]);
  }
  write("large_class.xlsx", rows);
}

// clustered_marks: std smaller than the 10-mark bin width, so the expected-count
// curve peaks above the tallest bar (bell-curve overflow).
{
  const rows = [HEADERS];
  let n = 1;
  for (const m of [64, 65, 65, 65, 66, 64, 65, 66, 65, 65]) rows.push([id(n++), "CS F211", m]);
  for (const m of [55, 58, 60, 62, 64, 66, 68, 70, 74, 77]) rows.push([id(n++), "MATH F112", m]);
  write("clustered_marks.xlsx", rows);
}

// empty: header row only.
write("empty.xlsx", [HEADERS]);

// comma_names: course names that need CSV quoting.
write("comma_names.xlsx", [
  HEADERS,
  [id(1), "Data Structures, Algorithms", 81],
  [id(2), "Data Structures, Algorithms", 42],
  [id(3), 'Intro to "C"', 90],
]);

// numeric_course: course codes that Excel stores as numbers, plus a
// trailing-space variant of the same code.
write("numeric_course.xlsx", [
  HEADERS,
  [id(1), 101, 75],
  [id(2), 101, 55],
  [id(3), "101 ", 85],
  [id(4), 202, 35],
]);

// corrupt: bytes that are not a spreadsheet, saved with an .xlsx name.
require("fs").writeFileSync(
  path.join(OUT, "corrupt.xlsx"),
  Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02])
);
console.log("wrote corrupt.xlsx (invalid zip)");
