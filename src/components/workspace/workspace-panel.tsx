import { createClient } from "@/lib/supabase/server";
import {
  listWorkspaces,
  getCurrentWorkspaceId,
  fetchWorkspaceDetail,
  fetchTodayBundle,
} from "@/lib/queries/workspace";
import { WorkspacePanelClient } from "./workspace-panel-client";

export async function WorkspacePanel() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <WorkspacePanelClient
        workspaces={[]}
        currentWorkspaceId={null}
        detail={null}
        todayBundle={null}
      />
    );
  }

  const [workspaces, currentWorkspaceId] = await Promise.all([
    listWorkspaces(supabase, user.id),
    getCurrentWorkspaceId(supabase, user.id),
  ]);

  let detail = null;
  let todayBundle = null;
  if (currentWorkspaceId) {
    detail = await fetchWorkspaceDetail(supabase, user.id, currentWorkspaceId);
    // If the workspace was archived or missing, fall back to Today view
    if (!detail) {
      todayBundle = await fetchTodayBundle(supabase, user.id);
    }
  } else {
    todayBundle = await fetchTodayBundle(supabase, user.id);
  }

  return (
    <WorkspacePanelClient
      workspaces={workspaces}
      currentWorkspaceId={detail ? currentWorkspaceId : null}
      detail={detail}
      todayBundle={todayBundle}
    />
  );
}
