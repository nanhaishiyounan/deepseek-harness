import { type HttpError, useTranslate } from "@refinedev/core";
import { useForm } from "@refinedev/react-hook-form";
import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useRouteSurfaceClose } from "@nocobase/portal-sdk/routing";
import {
  RouteDrawer,
  RouteDrawerFooter,
  useRefineUnsavedChangesGuard,
} from "@/extensions/nocobase-route-surfaces";
import { useContextualCloseTo } from "../route-surfaces";
import type { ReplyFormValues, ReplyRecord } from "../types";

const REPLIES = "hub_hd_replies";

type ReplySurfaceProps = { presetTicketId?: string };

/**
 * One-level-deeper nested drawer: edit a single reply from inside the ticket
 * detail drawer, at /tickets/show/:id/replies/edit/:replyId. Mirrors the
 * projects checklist edit surface (small child record, natural deeper popup).
 */
export const ReplyEdit = ({ presetTicketId }: ReplySurfaceProps) => {
  const translate = useTranslate();
  const { replyId } = useParams<{ replyId: string }>();
  const closeTo = useContextualCloseTo();
  const { beforeClose, confirmation } = useRefineUnsavedChangesGuard();
  return (
    <>
      <RouteDrawer
        title={translate(
          "helpdesk.reply.drawer.edit.title",
          { ns: "starter" },
          "Edit reply"
        )}
        description={translate(
          "helpdesk.reply.drawer.edit.desc",
          { ns: "starter" },
          "Update the text of this reply."
        )}
        closeTo={closeTo}
        closeLabel={translate("buttons.close", "Close")}
        beforeClose={beforeClose}
      >
        <ReplyEditForm recordId={replyId} presetTicketId={presetTicketId} />
      </RouteDrawer>
      {confirmation}
    </>
  );
};

function ReplyEditForm({
  recordId,
  presetTicketId,
}: ReplySurfaceProps & { recordId?: string }) {
  const translate = useTranslate();
  const close = useRouteSurfaceClose();
  const {
    refineCore: { onFinish, query },
    ...form
  } = useForm<ReplyRecord, HttpError, ReplyFormValues>({
    refineCoreProps: {
      resource: REPLIES,
      action: "edit",
      id: recordId,
      redirect: false,
      onMutationSuccess: () => close({ skipBeforeClose: true }),
    },
  });

  const record = query?.data?.data;
  const seeded = useRef(false);
  useEffect(() => {
    if (!record || seeded.current) return;
    seeded.current = true;
    form.reset({
      body: record.body ?? "",
      ticketId:
        record.ticketId != null
          ? String(record.ticketId)
          : presetTicketId
          ? String(presetTicketId)
          : null,
    });
  }, [record, form, presetTicketId]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onFinish(values))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <FormField
            control={form.control}
            name="body"
            rules={{
              required: translate(
                "helpdesk.reply.fields.body.required",
                { ns: "starter" },
                "Reply text is required"
              ),
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {translate("helpdesk.reply.fields.body", { ns: "starter" }, "Reply")}
                </FormLabel>
                <FormControl
                  render={
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      className="min-h-32"
                      autoFocus
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <RouteDrawerFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => close()}>
            {translate("buttons.cancel", "Cancel")}
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? translate("helpdesk.reply.actions.saving", { ns: "starter" }, "Saving...")
              : translate("helpdesk.reply.actions.save", { ns: "starter" }, "Save reply")}
          </Button>
        </RouteDrawerFooter>
      </form>
    </Form>
  );
}
