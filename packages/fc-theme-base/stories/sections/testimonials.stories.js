import { expect, waitFor } from 'storybook/test';
import { sectionHeader } from '../fixtures.js';
import { loadScript, section } from '../liquid.js';

const quote = (id, name, role, rating = 5) => ({
  id,
  type: '_testimonial',
  settings: { quote: `${name} says the kit arrived fast and fits well.`, name, role, rating },
});

const quotes = [
  quote('quote-1', 'Marguerite Lavoie', 'Épée coach'),
  quote('quote-2', 'Daniel Osei', 'Sabre fencer'),
  quote('quote-3', 'Yuki Tanaka', 'Foil coach'),
  quote('quote-4', 'Priya Raman', 'Club manager', 0),
];

/** `sections/testimonials.liquid`: customer quotes in a carousel, three at a time on desktop. Each is a `_testimonial` block. */
export default {
  title: 'Sections/Testimonials',
  parameters: { layout: 'fullscreen' },
  loaders: [loadScript('fc-carousel.js')],
  render: section('testimonials', { staticBlocks: [sectionHeader('Testimonials', 'Loved by the fencing community')], blocks: quotes }),
};

export const Quotes = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Loved by the fencing community' })).toBeVisible();
    await expect(canvas.getAllByRole('img', { name: '5 out of 5 stars' })).toHaveLength(3);
    await userEvent.click(canvas.getByRole('button', { name: 'Next testimonial' }));
    await waitFor(() => expect(canvas.getByRole('tab', { name: 'Testimonial 2' })).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(canvas.getByText('Priya Raman')).toBeVisible());
  },
};
