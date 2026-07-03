import { SkeletonTable } from "nhcx_cli";

export const Default = () => <SkeletonTable rows={5} cols={5} />;

export const Compact = () => <SkeletonTable rows={3} cols={3} />;
