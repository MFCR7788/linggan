import { makeScene2D, Rect, Txt } from '@revideo/2d';

export default makeScene2D('Minimal', function* (view) {
  view.add(<Rect width={1920} height={1080} fill="#0A1629" />);
  view.add(<Txt text="Revideo PoC Test" fontSize={64} fontWeight={700} fill="#FFFFFF" />);
  yield;
});
