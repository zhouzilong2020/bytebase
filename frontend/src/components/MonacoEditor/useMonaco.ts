import { computed } from "vue";
import { useStore } from "vuex";
import { useNamespacedGetters } from "vuex-composition-helpers";
import * as monaco from "monaco-editor";
import type { editor as Editor } from "monaco-editor";

import AutoCompletion from "./AutoCompletion";
import {
  ConnectionAtom,
  Database,
  Table,
  CompletionItems,
  InstanceGetters,
  SqlDialect,
} from "../../types";
import sqlFormatter from "./sqlFormatter";

const useMonaco = async (lang: string) => {
  const store = useStore();

  const { instanceList } = useNamespacedGetters<InstanceGetters>("instance", [
    "instanceList",
  ]);

  const databaseList = computed(() => {
    const currentInstanceId =
      store.state.sqlEditor.connectionContext.instanceId;
    return store.getters["database/databaseListByInstanceId"](
      currentInstanceId
    );
  });

  const tableList = computed(() => {
    return databaseList.value
      .map((item: ConnectionAtom) =>
        store.getters["table/tableListByDatabaseId"](item.id)
      )
      .flat();
  });

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    ...monaco.languages.typescript.typescriptDefaults.getCompilerOptions(),
    noUnusedLocals: false,
    noUnusedParameters: false,
    allowUnreachableCode: true,
    allowUnusedLabels: true,
    strict: false,
    allowJs: true,
  });

  const completionItemProvider =
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: [" ", "."],
      provideCompletionItems: (model, position) => {
        let suggestions: CompletionItems = [];

        const { lineNumber, column } = position;
        // The text before the cursor pointer
        const textBeforePointer = model.getValueInRange({
          startLineNumber: lineNumber,
          startColumn: 0,
          endLineNumber: lineNumber,
          endColumn: column,
        });
        // The multi-text before the cursor pointer
        const textBeforePointerMulti = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 0,
          endLineNumber: lineNumber,
          endColumn: column,
        });
        // The text after the cursor pointer
        const textAfterPointerMulti = model.getValueInRange({
          startLineNumber: lineNumber,
          startColumn: column,
          endLineNumber: model.getLineCount(),
          endColumn: model.getLineMaxColumn(model.getLineCount()),
        });
        const tokens = textBeforePointer.trim().split(/\s+/);
        const lastToken = tokens[tokens.length - 1].toLowerCase();

        const autoCompletion = new AutoCompletion(
          model,
          position,
          instanceList.value(),
          databaseList.value,
          tableList.value
        );

        // MySQL allows to query different databases, so we provide the database name suggestion for MySQL.
        const suggestionsForDatabase =
          lang === "mysql"
            ? autoCompletion.getCompletionItemsForDatabaseList()
            : [];

        const suggestionsForTable =
          autoCompletion.getCompletionItemsForTableList();

        const suggestionsForKeyword =
          autoCompletion.getCompletionItemsForKeywords();

        // if enter a dot
        if (lastToken.endsWith(".")) {
          /**
           * tokenLevel = 1 stands for the database.table or table.column
           * tokenLevel = 2 stands for the database.table.column
           */
          const tokenLevel = lastToken.split(".").length - 1;
          const lastTokenBeforeDot = lastToken.slice(0, -1);
          let [databaseName, tableName] = ["", ""];
          if (tokenLevel === 1) {
            databaseName = lastTokenBeforeDot;
            tableName = lastTokenBeforeDot;
          }
          if (tokenLevel === 2) {
            databaseName = lastTokenBeforeDot.split(".").shift() as string;
            tableName = lastTokenBeforeDot.split(".").pop() as string;
          }
          const dbIdx = databaseList.value.findIndex(
            (item: Database) => item.name === databaseName
          );
          const tableIdx = tableList.value.findIndex(
            (item: Table) => item.name === tableName
          );

          // if the last token is a database name
          if (lang === "mysql" && dbIdx !== -1 && tokenLevel === 1) {
            suggestions = autoCompletion.getCompletionItemsForTableList(
              databaseList.value[dbIdx],
              true
            );
          }
          // if the last token is a table name
          if (tableIdx !== -1 || tokenLevel === 2) {
            const table = tableList.value[tableIdx];
            if (table.columnList && table.columnList.length > 0) {
              suggestions = autoCompletion.getCompletionItemsForTableColumnList(
                tableList.value[tableIdx],
                false
              );
            }
          }
        } else {
          suggestions = [
            ...suggestionsForKeyword,
            ...suggestionsForTable,
            ...suggestionsForDatabase,
          ];
        }

        return { suggestions };
      },
    });

  await Promise.all([
    // load workers
    (async () => {
      const [{ default: EditorWorker }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        import("monaco-editor/esm/vs/editor/editor.worker.js?worker"),
      ]);

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      window.MonacoEnvironment = {
        getWorker(_: any, label: string) {
          return new EditorWorker();
        },
      };
    })(),
  ]);

  const setContent = (
    editorInstance: Editor.IStandaloneCodeEditor,
    content: string
  ) => {
    if (editorInstance) editorInstance.setValue(content);
  };

  const formatContent = (
    editorInstance: Editor.IStandaloneCodeEditor,
    language: SqlDialect
  ) => {
    if (editorInstance) {
      const sql = editorInstance.getValue();
      const { data } = sqlFormatter(sql, language);
      setContent(editorInstance, data);
    }
  };

  const setPositionAtEndOfLine = (
    editorInstance: Editor.IStandaloneCodeEditor
  ) => {
    if (editorInstance) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      const range = editorInstance.getModel().getFullModelRange();
      editorInstance.setPosition({
        lineNumber: range?.endLineNumber,
        column: range?.endColumn,
      });
    }
  };

  return {
    monaco,
    completionItemProvider,
    formatContent,
    setContent,
    setPositionAtEndOfLine,
  };
};

export { useMonaco };
