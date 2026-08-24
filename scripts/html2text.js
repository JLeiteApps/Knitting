const fs = require('fs');
const path = require('path');

// Minimal HTML → text: strips scripts/styles/tags, collapses whitespace, keeps line structure
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|blockquote)>/gi, '\n')
    .replace(/<h([1-6])[^>]*>/gi, (m, l) => '\n' + '#'.repeat(+l) + ' ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8217;|&rsquo;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#215;|&times;/g, 'x')
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim())
    .filter((l, i, arr) => l !== '' || arr[i-1] !== '')
    .join('\n');
}

const file = process.argv[2];
const out = process.argv[3] || file.replace(/\.html?$/, '.txt');
const text = htmlToText(fs.readFileSync(file, 'utf-8'));
fs.writeFileSync(out, text, 'utf-8');
console.log(`${file} -> ${out}: ${text.length} chars`);
