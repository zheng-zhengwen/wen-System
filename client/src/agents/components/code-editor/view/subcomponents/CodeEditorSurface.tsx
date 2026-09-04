import CodeMirror from '@uiw/react-codemirror';
import type { Extension } from '@codemirror/state';
import MarkdownPreview from './markdown/MarkdownPreview';

type CodeEditorSurfaceProps = {
  content: string;
  onChange: (value: string) => void;
  markdownPreview: boolean;
  isMarkdownFile: boolean;
  fontSize: number;
  showLineNumbers: boolean;
  extensions: Extension[];
};

export default function CodeEditorSurface({
  content,
  onChange,
  markdownPreview,
  isMarkdownFile,
  fontSize,
  showLineNumbers,
  extensions,
}: CodeEditorSurfaceProps) {
  if (markdownPreview && isMarkdownFile) {
    return (
      <div className="h-full overflow-y-auto bg-white bg-gray-900">
        <div className="prose prose-sm mx-auto max-w-4xl max-w-none px-8 py-6 prose-invert prose-headings:font-semibold prose-a:text-blue-600 prose-code:text-sm prose-pre:bg-gray-900 prose-img:rounded-lg prose-a:text-blue-400">
          <MarkdownPreview content={content} />
        </div>
      </div>
    );
  }

  return (
    <CodeMirror
      value={content}
      onChange={onChange}
      extensions={extensions}
      theme={undefined}
      height="100%"
      style={{
        fontSize: `${fontSize}px`,
        height: '100%',
      }}
      basicSetup={{
        lineNumbers: showLineNumbers,
        foldGutter: true,
        dropCursor: false,
        allowMultipleSelections: false,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
        highlightSelectionMatches: true,
        searchKeymap: true,
      }}
    />
  );
}
