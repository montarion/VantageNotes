// components/page.ts
import { VNComponent } from "./base.ts";
import type { ExtractedTask, Metadata } from "../metadata.ts";
import type { VNObject } from "../sidebar.ts";
import { getApp } from "../app.ts";

export class VNPageComponent extends VNComponent {

  protected render(): void {
    const data = this._data as VNObject & { metadata?: Metadata };

    const { navigation, events } = getApp();
    const editor = navigation.editor?.view;

    const metadata = data.properties.metadata as Metadata | undefined;

    const title = data.title ?? "Untitled Page";

    const tasks = metadata?.tasks ?? [];
    console.warn(tasks)
    const tags = metadata?.tags ?? {};

    const entityCount = Object.keys(metadata?.entities?.unknown ?? {}).length;

    const linkCount =
      Object.keys(metadata?.links?.external ?? {}).length +
      Object.keys(metadata?.links?.wikilinks ?? {}).length;

    const semanticCount = Object.keys(metadata?.semantics ?? {}).length;

    const stats = metadata?.stats ?? {};

    const tagEntries = Object.entries(tags).sort((a, b) => b[1] - a[1]);

    const renderTasks = () => {
        if (tasks.length === 0) {
          return `<div class="muted">No tasks</div>`;
        }
      
        return `
            <ul class="tasks">
                ${tasks.map((t: ExtractedTask) => `
                <li 
                    class="task ${t.task_complete ? "done" : ""}"
                    data-line="${t.line_number}"
                    data-position="${t.position}"
                >

                    <input
                    class="task-checkbox"
                    type="checkbox"
                    ${t.task_complete ? "checked" : ""}
                    />

                    <span class="content">
                    ${t.task_content}
                    </span>

                    ${
                    t.priority !== null
                        ? `<span class="priority">P${t.priority}</span>`
                        : ""
                    }

                    ${
                    t.due_date
                        ? `<span class="due">📅 ${t.due_date}</span>`
                        : ""
                    }

                    ${
                    t.entities.length > 0
                        ? `<span class="entities">
                            ${t.entities.map(e => `@${e}`).join(" ")}
                        </span>`
                        : ""
                    }

                </li>
                `).join("")}
            </ul>
            `;
      };
    this.root.innerHTML = `
      <style>
        ${this.getBaseStyles()}

        .card {
          flex-direction: column;
          align-items: flex-start;
          height: auto;
        }

        h2 {
          margin: 0;
          font-size: 16px;
        }

        .section {
          margin-top: 8px;
          font-size: 12px;
        }

        .muted {
          color: var(--sidebar-muted);
        }

        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 4px;
        }

        .tag {
          background: var(--sidebar-hover);
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 11px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .tag-count {
          opacity: 0.7;
          font-size: 10px;
        }

        .tasks {
            padding-left: 0;
            margin: 6px 0;
            list-style: none;
            }

            .task {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            font-size: 12px;
            align-items: center;
            }

            .task.done .content {
            text-decoration: line-through;
            opacity: 0.6;
            }

            .checkbox {
            width: 14px;
            }

            .priority {
            font-size: 10px;
            background: rgba(var(--cm-accent-color),0.15);
            padding: 1px 4px;
            border-radius: 4px;
            }

            .due {
            font-size: 10px;
            color: var(--sidebar-muted);
            }

            .entities {
            font-size: 10px;
            opacity: 0.8;
            }

        ul {
          padding-left: 16px;
          margin: 4px 0;
        }

        li {
          font-size: 12px;
        }
        .content {
            cursor: pointer;
        }

        .content:hover {
            text-decoration: underline;
        }
      </style>

      <div class="card">

        <h2>${title}</h2>

        <div class="section">
          <strong>Tasks</strong>
          ${renderTasks()}
        </div>

        <div class="section">
          <strong>Tags</strong>
          ${
            tagEntries.length === 0
              ? `<div class="muted">No tags</div>`
              : `<div class="tags">
                  ${tagEntries
                    .map(
                      ([tag, count]) => `
                        <span class="tag">
                          #${tag}
                          <span class="tag-count">${count}</span>
                        </span>
                      `
                    )
                    .join("")}
                </div>`
          }
        </div>

        <div class="section">
          <strong>Stats</strong>
          <div>Entities: ${entityCount || 0}</div>
          <div>Links: ${linkCount || 0}</div>
          <div>Semantics: ${semanticCount || 0}</div>

          ${
            Object.keys(stats).length === 0
              ? `<div class="muted">No additional stats</div>`
              : Object.entries(stats)
                  .map(([k, v]) => `<div>${k}: ${v}</div>`)
                  .join("")
          }
        </div>

      </div>
    `;



    /* TEXT CLICK → navigate to task */
    this.root.querySelectorAll(".content").forEach((el) => {
    el.addEventListener("click", (e) => {
        const task = (el as HTMLElement).closest(".task") as HTMLElement;
        const position = Number(task.dataset.position);

        editor.dispatch({
        selection: { anchor: position + 6 },
        scrollIntoView: true
        });
    });
    });


    /* CHECKBOX CLICK → emit custom event */
    this.root.querySelectorAll(".task-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("click", (e) => {
        e.stopPropagation();

        const task = (checkbox as HTMLElement).closest(".task") as HTMLElement;

        //const event = new CustomEvent("vn-task-toggle", {
        //bubbles: true,
        //composed: true,
        //detail: {
        //    line: Number(task.dataset.line),
        //    position: Number(task.dataset.position),
        //    checked: (checkbox as HTMLInputElement).checked
        //}
        //});

        //this.dispatchEvent(event);
        events.emit("task:toggle-requested", {
            docId: null,
            from: task.dataset.position
        })
    });
    });
  }
}

customElements.define("vn-page", VNPageComponent);