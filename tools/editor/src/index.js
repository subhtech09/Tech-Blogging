/* Editor for the /write/ page, bundled into assets/js/editor.bundle.js.
   Only the formatting the site can render is allowed: anything else pasted in
   (fonts, sizes, arbitrary colours) is dropped by the schema. */
import { Editor, Node, Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';

export const THEME_COLORS = ['mint', 'sky', 'teal', 'warn'];
export const CALLOUTS = ['note', 'tip', 'warning'];

// Text colour limited to the site's theme colours (they adapt to dark mode).
const ThemeColor = Mark.create({
  name: 'themeColor',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => {
          const match = (el.getAttribute('class') || '').match(/\btc-(mint|sky|teal|warn)\b/);
          return match ? match[1] : null;
        },
        renderHTML: (attrs) => (attrs.color ? { class: 'tc-' + attrs.color } : {})
      }
    };
  },
  parseHTML() {
    return [{ tag: 'span[class*="tc-"]', getAttrs: (el) => (/\btc-(mint|sky|teal|warn)\b/.test(el.className) ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
  addCommands() {
    return {
      setThemeColor: (color) => ({ commands }) =>
        THEME_COLORS.includes(color) ? commands.setMark(this.name, { color }) : commands.unsetMark(this.name),
      unsetThemeColor: () => ({ commands }) => commands.unsetMark(this.name)
    };
  }
});

// H2–H4 only; pasted H1 becomes H2 and H5/H6 become H4 instead of plain text.
const SiteHeading = Heading.extend({
  parseHTML() {
    return [1, 2, 3, 4, 5, 6].map((n) => ({ tag: 'h' + n, attrs: { level: Math.min(4, Math.max(2, n)) } }));
  }
}).configure({ levels: [2, 3, 4] });

// Note / tip / warning box — published as a kramdown blockquote with a class.
const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: (el) => CALLOUTS.find((t) => el.classList.contains(t)) || 'note',
        renderHTML: (attrs) => ({ class: attrs.type })
      }
    };
  },
  parseHTML() {
    return [{ tag: 'blockquote.note' }, { tag: 'blockquote.tip' }, { tag: 'blockquote.warning' }].map((rule) => ({
      ...rule,
      priority: 60
    }));
  },
  renderHTML({ HTMLAttributes }) {
    return ['blockquote', HTMLAttributes, 0];
  },
  addCommands() {
    return {
      setCallout: (type) => ({ editor, commands }) => {
        if (!CALLOUTS.includes(type)) return commands.lift(this.name);
        if (editor.isActive(this.name)) return commands.updateAttributes(this.name, { type });
        return commands.wrapIn(this.name, { type });
      },
      unsetCallout: () => ({ commands }) => commands.lift(this.name)
    };
  }
});

// Block image with caption. `file` is the uploaded file name (set once the
// upload finishes); `uid` tracks an image while it uploads; `status` is
// "uploading" or "error" while it isn't ready to publish.
const Figure = Node.create({
  name: 'figure',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      file: { default: null },
      alt: { default: '' },
      caption: { default: '' },
      uid: { default: null },
      status: { default: null }
    };
  },
  parseHTML() {
    return [
      {
        tag: 'figure',
        priority: 60,
        getAttrs: (el) => {
          const img = el.querySelector('img');
          if (!img) return false;
          const cap = el.querySelector('figcaption');
          return {
            src: img.getAttribute('src'),
            file: img.getAttribute('data-file'),
            alt: img.getAttribute('alt') || '',
            caption: cap ? cap.textContent.trim() : ''
          };
        }
      },
      {
        tag: 'img[src]',
        getAttrs: (el) => ({ src: el.getAttribute('src'), file: el.getAttribute('data-file'), alt: el.getAttribute('alt') || '' })
      }
    ];
  },
  renderHTML({ node }) {
    const a = node.attrs;
    const img = ['img', { src: a.src, alt: a.alt || a.caption || '', 'data-file': a.file || null }];
    const figAttrs = mergeAttributes({ class: 'diagram editor-figure' }, a.status ? { 'data-status': a.status } : {});
    return a.caption ? ['figure', figAttrs, img, ['figcaption', {}, a.caption]] : ['figure', figAttrs, img];
  }
});

export function createEditor(element, options) {
  // Only pass the event handlers the page provides.
  const handlers = {};
  ['onUpdate', 'onSelectionUpdate', 'onTransaction'].forEach((name) => {
    if (typeof options[name] === 'function') handlers[name] = options[name];
  });
  return new Editor({
    ...handlers,
    element,
    content: options.content || '',
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: { languageClassPrefix: 'language-' }
      }),
      SiteHeading,
      Underline,
      Highlight,
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener', target: null }
      }),
      Placeholder.configure({ placeholder: options.placeholder || 'Start writing…' }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ThemeColor,
      Callout,
      Figure
    ],
    editorProps: Object.assign({ attributes: { class: 'prose editor-surface', spellcheck: 'true' } }, options.editorProps || {})
  });
}

window.BlogEditor = { createEditor, THEME_COLORS, CALLOUTS };
