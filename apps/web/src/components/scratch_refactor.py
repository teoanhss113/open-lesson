import os

filepath = "/Users/teoanhss113/Downloads/Project/open-lesson/apps/web/src/components/SettingsDialog.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove export type SettingsSection definition block
type_start_str = "export type SettingsSection ="
type_end_str = "| 'about';"

idx_start = content.find(type_start_str)
if idx_start != -1:
    idx_end = content.find(type_end_str, idx_start)
    if idx_end != -1:
        # Find the newline after type_end_str
        idx_end_nl = content.find("\n", idx_end)
        content = content[:idx_start] + content[idx_end_nl+1:]
        print("Removed SettingsSection type definition.")
else:
    print("Warning: SettingsSection type definition not found.")

# 2. Replace export { switchApiProtocolConfig ... } from './settings'
old_export_block = """export {
  switchApiProtocolConfig,
  updateCurrentApiProtocolConfig,
  type SettingsSection,
  type AgentRefreshOptions,
} from './settings';"""

new_export_block = "export * from './settings';"

if old_export_block in content:
    content = content.replace(old_export_block, new_export_block)
    print("Replaced settings exports with export *.")
else:
    # Try with single quotes or potential spacing differences
    # Let's search by prefix/suffix
    alt_start = content.find("export {\n  switchApiProtocolConfig,")
    if alt_start != -1:
        alt_end = content.find("} from './settings';", alt_start)
        if alt_end != -1:
            idx_end_nl = content.find("\n", alt_end)
            content = content[:alt_start] + new_export_block + content[idx_end_nl:]
            print("Replaced alternative settings exports.")
        else:
            print("Warning: alt export end not found.")
    else:
        print("Warning: export block not found.")

# 3. Remove const [showApiKey, setShowApiKey] = useState(false);
show_api_key_str = "  const [showApiKey, setShowApiKey] = useState(false);\n"
if show_api_key_str in content:
    content = content.replace(show_api_key_str, "")
    print("Removed showApiKey state declaration.")
else:
    print("Warning: showApiKey state not found.")

# 4. Remove installedCount and setMode
set_mode_block = """  const installedCount = useMemo(
    () => agents.filter((a) => a.available).length,
    [agents],
  );

  const setMode = (mode: ExecMode) => {
    setCfg((c) => {
      const modeBefore = executionModeToTracking(c.mode);
      const modeAfter = executionModeToTracking(mode);
      if (modeBefore !== modeAfter) {
        trackSettingsClickExecutionModeTab(analytics.track, {
          page: 'settings',
          area: 'execution_model',
          element: 'execution_mode_tab',
          action: 'switch_execution_mode',
          mode_before: modeBefore,
          mode_after: modeAfter,
        });
      }
      return { ...c, mode };
    });
  };\n"""

if set_mode_block in content:
    content = content.replace(set_mode_block, "")
    print("Removed installedCount and setMode function.")
else:
    # Try finding setMode block individually if layout changed
    idx_set_mode = content.find("const setMode = (mode: ExecMode) => {")
    if idx_set_mode != -1:
        # Find closing brace of setMode
        brace_count = 0
        idx = idx_set_mode + len("const setMode = (mode: ExecMode) => {")
        for i in range(idx, len(content)):
            if content[i] == '{':
                brace_count += 1
            elif content[i] == '}':
                if brace_count == 0:
                    idx_end = i + 1
                    # also consume trailing newline
                    if idx_end < len(content) and content[idx_end] == '\n':
                        idx_end += 1
                    # we want to delete from the beginning of indentation
                    # let's search backward for indentation
                    idx_start_set_mode = content.rfind("\n", 0, idx_set_mode)
                    if idx_start_set_mode != -1:
                        content = content[:idx_start_set_mode+1] + content[idx_end:]
                        print("Individually deleted setMode.")
                    break
                else:
                    brace_count -= 1
    else:
        print("Warning: setMode block not found.")

# 5. Remove helper variables block
helper_vars_start = "  const protocolProviders = useMemo("
helper_vars_end = ": cfg.model;"

idx_helper_start = content.find(helper_vars_start)
if idx_helper_start != -1:
    idx_helper_end = content.find(helper_vars_end, idx_helper_start)
    if idx_helper_end != -1:
        idx_helper_end_nl = content.find("\n", idx_helper_end)
        content = content[:idx_helper_start] + content[idx_helper_end_nl+1:]
        print("Removed helper variables.")
else:
    print("Warning: helper variables not found.")

# 6. Replace execution conditional render block with <ExecutionSection ... />
exec_start_str = "{activeSection === 'execution' ? ("
exec_end_str = "{activeSection === 'media' ? ("

idx_exec_start = content.find(exec_start_str)
idx_exec_end = content.find(exec_end_str)

if idx_exec_start != -1 and idx_exec_end != -1:
    # Find activeSection === 'execution' leading spaces/indentation
    # typically it's preceded by spaces
    line_start_idx = content.rfind("\n", 0, idx_exec_start)
    indent = ""
    if line_start_idx != -1:
        indent = content[line_start_idx+1:idx_exec_start]

    replacement_exec = f"""{{activeSection === 'execution' ? (
{indent}  <ExecutionSection
{indent}    cfg={{cfg}}
{indent}    setCfg={{setCfg}}
{indent}    daemonLive={{daemonLive}}
{indent}    agents={{agents}}
{indent}    agentTestState={{agentTestState}}
{indent}    setAgentTestState={{setAgentTestState}}
{indent}    agentRescanRunning={{agentRescanRunning}}
{indent}    handleRefreshAgents={{handleRefreshAgents}}
{indent}    agentRescanNotice={{agentRescanNotice}}
{indent}    handleTestAgent={{handleTestAgent}}
{indent}    apiProtocol={{apiProtocol}}
{indent}    setApiProtocol={{setApiProtocol}}
{indent}    updateApiConfig={{updateApiConfig}}
{indent}    providerTestState={{providerTestState}}
{indent}    handleTestProvider={{handleTestProvider}}
{indent}    providerModelsState={{providerModelsState}}
{indent}    handleFetchProviderModels={{handleFetchProviderModels}}
{indent}    providerModelsCache={{providerModelsCache}}
{indent}    apiModelCustomEditing={{apiModelCustomEditing}}
{indent}    setApiModelCustomEditing={{setApiModelCustomEditing}}
{indent}    agentCustomModelIds={{agentCustomModelIds}}
{indent}    setAgentCustomModelIds={{setAgentCustomModelIds}}
{indent}  />
{indent}) : null}}

{indent}"""
    content = content[:idx_exec_start] + replacement_exec + content[idx_exec_end:]
    print("Replaced execution conditional render block with ExecutionSection.")
else:
    print("Warning: execution render block indices not found.")

# 7. Truncate after the end of SettingsDialog component
# SettingsDialog component ends with a block like:
#         </div>
#       </div>
#     </div>
#   );
# }
# and then there's comments/code.
# Let's search for "export function ConnectorSection" or "export type ComposioCredentialState"
idx_truncate_marker = content.find("export type ComposioCredentialState =")
if idx_truncate_marker == -1:
    idx_truncate_marker = content.find("export function ConnectorSection")

if idx_truncate_marker != -1:
    # Find the last closing brace '}' before the marker
    idx_close_brace = content.rfind("}", 0, idx_truncate_marker)
    if idx_close_brace != -1:
        # Keep everything up to and including the closing brace + newline
        content = content[:idx_close_brace+1] + "\n"
        print("Truncated file at SettingsDialog closing brace.")
    else:
        print("Warning: closing brace of SettingsDialog not found before marker.")
else:
    print("Warning: truncate marker not found.")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Done refactoring SettingsDialog.tsx!")
