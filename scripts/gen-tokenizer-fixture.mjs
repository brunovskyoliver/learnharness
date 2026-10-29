/** Regenerate only when deliberately updating the pinned tokenizer reference. */
import { writeFile } from 'node:fs/promises';
import { getEncoding } from 'js-tiktoken';

const texts = ['', 'hello', 'Hello, world!', ' leading space', '  two spaces  ', 'line one\nline two', '\n\n', '\tindent', '😀', '👩🏽‍💻', '你好世界', '日本語のトークン', 'café', 'naïve résumé', 'unbelievably', '1234567890', 'a+b = c²', 'Tokenizers split unbelievably long words.', 'é\n中 😀', 'a'.repeat(2000)];
const names = { o200k: 'o200k_base', cl100k: 'cl100k_base', gpt2: 'gpt2' };
const cases = texts.map(text => ({ text, encodings: {} }));
for (const [name, encoding] of Object.entries(names)) {
  const tokenizer = getEncoding(encoding);
  for (const item of cases) {
    const ids = tokenizer.encode(item.text);
    // Pinned 1.0.21's constructor stores exact rank bytes in textMap;
    // decode([id]) is lossy for partial UTF-8, so use this reference map.
    item.encodings[name] = ids.map(id => {
      const bytes = tokenizer.textMap.get(id);
      try { return { id, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }; }
      catch { return { id, text: null, bytes: Array.from(bytes) }; }
    });
    if (tokenizer.decode(ids) !== item.text) throw new Error('Reference round trip failed');
  }
}
await writeFile(new URL('../tests/fixtures/tokenizer-reference.json', import.meta.url), JSON.stringify({ package: 'js-tiktoken@1.0.21', cases }, null, 2) + '\n');
