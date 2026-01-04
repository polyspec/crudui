import { Link } from 'react-router-dom';

interface HomePageProps {
  language: 'ko' | 'en';
}

export function HomePage({ language }: HomePageProps) {
  const content = {
    ko: {
      title: 'Form Builder 데모',
      subtitle: 'YAML 스펙으로 폼을 렌더링하는 React 컴포넌트',
      features: {
        title: '주요 기능',
        items: [
          'YAML 스펙 기반 폼 렌더링',
          '실시간 유효성 검사',
          '조건부 필드 표시',
          '다국어 지원 (한국어/영어)',
          '다중 필드 (배열)',
          '중첩 그룹 구조',
        ],
      },
      demos: {
        title: '데모 페이지',
        contact: {
          title: '문의 폼',
          description: '기본적인 폼 필드와 유효성 검사',
        },
        registration: {
          title: '회원가입 폼',
          description: '조건부 필드와 중첩 그룹',
        },
        product: {
          title: '상품 등록 폼',
          description: '복잡한 구조와 다중 필드',
        },
      },
    },
    en: {
      title: 'Form Builder Demo',
      subtitle: 'React component that renders forms from YAML specs',
      features: {
        title: 'Key Features',
        items: [
          'YAML spec-based form rendering',
          'Real-time validation',
          'Conditional field display',
          'Multi-language support (Korean/English)',
          'Multiple fields (arrays)',
          'Nested group structures',
        ],
      },
      demos: {
        title: 'Demo Pages',
        contact: {
          title: 'Contact Form',
          description: 'Basic form fields and validation',
        },
        registration: {
          title: 'Registration Form',
          description: 'Conditional fields and nested groups',
        },
        product: {
          title: 'Product Form',
          description: 'Complex structures and multiple fields',
        },
      },
    },
  };

  const t = content[language];

  return (
    <div className="home-page">
      <div className="hero">
        <h1>{t.title}</h1>
        <p className="subtitle">{t.subtitle}</p>
      </div>

      <section className="features">
        <h2>{t.features.title}</h2>
        <ul>
          {t.features.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="demos">
        <h2>{t.demos.title}</h2>
        <div className="demo-cards">
          <Link to="/contact" className="demo-card">
            <h3>{t.demos.contact.title}</h3>
            <p>{t.demos.contact.description}</p>
          </Link>

          <Link to="/registration" className="demo-card">
            <h3>{t.demos.registration.title}</h3>
            <p>{t.demos.registration.description}</p>
          </Link>

          <Link to="/product" className="demo-card">
            <h3>{t.demos.product.title}</h3>
            <p>{t.demos.product.description}</p>
          </Link>
        </div>
      </section>

      <section className="usage">
        <h2>{language === 'ko' ? '사용법' : 'Usage'}</h2>
        <pre>
{`import { FormBuilder } from '@limepie/form-react';

const yamlSpec = \`
type: group
name: contact
properties:
  email:
    type: email
    label:
      ko: 이메일
      en: Email
    rules:
      required: true
      email: true
\`;

function MyForm() {
  return (
    <FormBuilder
      spec={yamlSpec}
      data={{ email: '' }}
      language="ko"
      onSubmit={(data, errors) => {
        if (Object.keys(errors).length === 0) {
          console.log('Submitted:', data);
        }
      }}
    />
  );
}`}
        </pre>
      </section>
    </div>
  );
}
