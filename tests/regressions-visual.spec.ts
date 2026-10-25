import { expect, test } from '@playwright/test';

test('publication wires and the lead star stay aligned with the SVG at every plate ratio', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.paper .plate').first().scrollIntoViewIfNeeded();
    const geometry = await page.locator('.paper .plate').first().evaluate((plate) => {
      const figure = plate.querySelector<SVGSVGElement>('.figure')!;
      const transform = figure.getScreenCTM()!;
      const points = [...figure.querySelectorAll<SVGGElement>('.star')].map((star) =>
        new DOMPoint().matrixTransform(star.getScreenCTM()!),
      );
      const origin = plate.getBoundingClientRect();
      const nearestStar = (x: number, y: number) => Math.min(...points.map((p) => Math.hypot(p.x - x, p.y - y)));
      const errors = [...plate.querySelectorAll<HTMLElement>('.wire')].flatMap((wire) => {
        const style = getComputedStyle(wire);
        const x = origin.x + parseFloat(style.left);
        const y = origin.y + parseFloat(style.top) + parseFloat(style.marginTop) + parseFloat(style.height) / 2;
        const angle = (parseFloat(style.rotate) * Math.PI) / 180;
        const length = parseFloat(style.width);
        return [nearestStar(x, y), nearestStar(x + length * Math.cos(angle), y + length * Math.sin(angle))];
      });
      const lead = plate.querySelector<SVGCircleElement>('.lead circle')!;
      const leadTransform = lead.getScreenCTM()!;
      const leadCenter = new DOMPoint().matrixTransform(leadTransform);
      const topStar = points[0]!;
      return {
        width: origin.width,
        height: origin.height,
        worstEndpointError: Math.max(...errors),
        leadCenterError: Math.hypot(topStar.x - leadCenter.x, topStar.y - leadCenter.y),
        leadRadiusError: Math.abs(lead.r.baseVal.value * leadTransform.a - 5.2 * transform.a),
      };
    });
    expect(geometry.width, `plate width at ${width}px`).toBeGreaterThan(0);
    expect(geometry.height, `plate height at ${width}px`).toBeGreaterThan(0);
    expect(geometry.worstEndpointError, `wire endpoints at ${width}px`).toBeLessThan(0.25);
    expect(geometry.leadCenterError, `lead center at ${width}px`).toBeLessThan(0.25);
    expect(geometry.leadRadiusError, `lead radius at ${width}px`).toBeLessThan(0.05);
  }
});

test('printing a flipped portrait shows its loaded front face and preserves the screen flip', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const flip = page.locator('[data-flip]');
  // DOM click avoids a mouse hover tilt; touch and keyboard use the same flip handler.
  await flip.evaluate((button: HTMLButtonElement) => button.click());
  await expect(flip).toHaveAttribute('aria-pressed', 'true');
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.portrait .card')).toHaveCSS('transform', 'none');
  await expect(page.locator('.portrait .back')).toBeHidden();
  const face = await page.locator('.portrait .front').evaluate((front) => {
    const rect = front.getBoundingClientRect();
    const image = front.querySelector('img')!;
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { loaded: image.complete && image.naturalWidth > 0, frontAtCenter: !!hit && front.contains(hit) };
  });
  expect(face).toEqual({ loaded: true, frontAtCenter: true });
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  await expect(flip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.portrait .card')).not.toHaveCSS('transform', 'none');
});
