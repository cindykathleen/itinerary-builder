UPDATE categories
SET color = '#D0ECD0'
WHERE logistics = true
  AND name = 'Transportation'
  AND lower(color) = '#d9ead3';

UPDATE categories
SET color = '#EAE0FF'
WHERE logistics = true
  AND name = 'Accommodations'
  AND lower(color) = '#d9d2e9';
