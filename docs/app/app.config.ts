export default defineAppConfig({
  docus: {
    colorMode: "dark",
  },
  seo: {
    title: "@agntn/archives",
    description:
      "One TypeScript interface over ten web archives: list captures, read what a page said, diff two versions, and hand the same tools to an agent.",
  },
  header: {
    title: "@agntn/archives",
  },
  github: {
    url: "https://github.com/agntn/archives",
    branch: "main",
    rootDir: "docs",
  },
  socials: {
    github: "https://github.com/agntn/archives",
    npm: "https://www.npmjs.com/package/@agntn/archives",
  },
  ui: {
    colors: {
      primary: "amber",
      neutral: "slate",
    },
    button: {
      slots: {
        base: "h-9 rounded-lg px-3.5 text-sm leading-none font-medium cursor-pointer transition-colors",
      },
      compoundVariants: [
        {
          color: "primary",
          variant: "solid",
          class: "archives-primary-fill ring-0",
        },
        {
          color: "neutral",
          variant: "outline",
          class: "archives-neutral-outline ring-0",
        },
      ],
    },
    pageHeader: {
      slots: {
        root: "py-8 border-b border-muted",
        headline: "archives-eyebrow mb-3",
        title: "text-3xl sm:text-4xl font-medium tracking-tight text-highlighted",
        description: "text-base leading-7 text-muted",
      },
    },
    contentSurround: {
      slots: {
        link: "rounded-xl archives-frame border-0 bg-default hover:bg-muted",
        linkLeadingIcon: "text-muted",
      },
    },
    prose: {
      callout: {
        slots: {
          base: "rounded-xl px-4 py-3.5",
        },
      },
      card: {
        slots: {
          base: "rounded-xl archives-frame border-0 p-5 bg-default hover:bg-muted",
          icon: "size-5 mb-3 text-muted transition-colors group-hover:text-primary",
          title: "text-sm font-medium",
          description: "text-sm text-muted",
        },
      },
      cardGroup: {
        base: "grid grid-cols-1 sm:grid-cols-2 gap-3 my-5 *:my-0",
      },
      table: {
        slots: {
          root: "rounded-xl archives-frame",
        },
      },
      pre: {
        slots: {
          header: "border-default bg-default",
          base: "border-default bg-muted",
        },
      },
    },
    pageHero: {
      slots: {
        title: "font-medium tracking-tight",
        description: "text-base leading-7 sm:text-lg",
      },
    },
  },
});
