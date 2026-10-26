UPDATE categories
SET color = '#DDEDE7'
WHERE logistics = true
  AND name = 'Transportation'
  AND lower(color) = '#d0ecd0';

UPDATE categories
SET color = '#E8DFF0'
WHERE logistics = true
  AND name = 'Accommodations'
  AND lower(color) = '#eae0ff';
