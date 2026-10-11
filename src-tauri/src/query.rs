use crate::error::{AppError, Result};
use crate::models::NoteFile;
use crate::storage::extract_tags;
use chrono::{DateTime, NaiveDate, Utc};

#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    Pinned,
    Archived,
    HasLink,
    HasCode,
    HasTasks,
    HasIncompleteTasks,
    HasAttachment,
    HasLocation,
    TagIn(Vec<String>),
    TagEquals(String),
    CreatedAtGte(DateTime<Utc>),
    CreatedAtLte(DateTime<Utc>),
    UpdatedAtGte(DateTime<Utc>),
    UpdatedAtLte(DateTime<Utc>),
    Not(Box<Expr>),
    And(Box<Expr>, Box<Expr>),
    Or(Box<Expr>, Box<Expr>),
}

impl Expr {
    pub fn matches(&self, note: &NoteFile) -> bool {
        match self {
            Expr::Pinned => note.meta.pinned,
            Expr::Archived => note.meta.archived,
            Expr::HasLink => {
                note.content.contains("http://")
                    || note.content.contains("https://")
                    || note.content.contains("](")
                    || !note.meta.relations.is_empty()
            }
            Expr::HasCode => note.content.contains("```") || note.content.contains('`'),
            Expr::HasTasks => {
                note.content.contains("- [ ]")
                    || note.content.contains("- [x]")
                    || note.content.contains("- [X]")
            }
            Expr::HasIncompleteTasks => note.content.contains("- [ ]"),
            Expr::HasAttachment => note.content.contains("!["),
            Expr::HasLocation => note.meta.location.is_some(),
            Expr::TagIn(tags) => {
                let note_tags = extract_tags(&note.content);
                tags.iter().any(|t| note_tags.iter().any(|nt| nt.eq_ignore_ascii_case(t)))
            }
            Expr::TagEquals(tag) => {
                let note_tags = extract_tags(&note.content);
                note_tags.iter().any(|nt| nt.eq_ignore_ascii_case(tag))
            }
            Expr::CreatedAtGte(dt) => note.meta.created_at >= *dt,
            Expr::CreatedAtLte(dt) => note.meta.created_at <= *dt,
            Expr::UpdatedAtGte(dt) => note.meta.updated_at >= *dt,
            Expr::UpdatedAtLte(dt) => note.meta.updated_at <= *dt,
            Expr::Not(inner) => !inner.matches(note),
            Expr::And(left, right) => left.matches(note) && right.matches(note),
            Expr::Or(left, right) => left.matches(note) || right.matches(note),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Ident(String),
    StringLit(String),
    And,
    Or,
    Not,
    LParen,
    RParen,
    LBracket,
    RBracket,
    Comma,
    Gte,
    Lte,
    Gt,
    Lt,
    Eq,
    Neq,
    In,
}

struct Lexer<'a> {
    chars: std::iter::Peekable<std::str::Chars<'a>>,
}

impl<'a> Lexer<'a> {
    fn new(input: &'a str) -> Self {
        Self {
            chars: input.chars().peekable(),
        }
    }

    fn tokenize(&mut self) -> Result<Vec<Token>> {
        let mut tokens = Vec::new();

        while let Some(&ch) = self.chars.peek() {
            if ch.is_whitespace() {
                self.chars.next();
                continue;
            }

            match ch {
                '(' => {
                    self.chars.next();
                    tokens.push(Token::LParen);
                }
                ')' => {
                    self.chars.next();
                    tokens.push(Token::RParen);
                }
                '[' => {
                    self.chars.next();
                    tokens.push(Token::LBracket);
                }
                ']' => {
                    self.chars.next();
                    tokens.push(Token::RBracket);
                }
                ',' => {
                    self.chars.next();
                    tokens.push(Token::Comma);
                }
                '!' => {
                    self.chars.next();
                    if let Some(&'=') = self.chars.peek() {
                        self.chars.next();
                        tokens.push(Token::Neq);
                    } else {
                        tokens.push(Token::Not);
                    }
                }
                '&' => {
                    self.chars.next();
                    if let Some(&'&') = self.chars.peek() {
                        self.chars.next();
                    }
                    tokens.push(Token::And);
                }
                '|' => {
                    self.chars.next();
                    if let Some(&'|') = self.chars.peek() {
                        self.chars.next();
                    }
                    tokens.push(Token::Or);
                }
                '>' => {
                    self.chars.next();
                    if let Some(&'=') = self.chars.peek() {
                        self.chars.next();
                        tokens.push(Token::Gte);
                    } else {
                        tokens.push(Token::Gt);
                    }
                }
                '<' => {
                    self.chars.next();
                    if let Some(&'=') = self.chars.peek() {
                        self.chars.next();
                        tokens.push(Token::Lte);
                    } else {
                        tokens.push(Token::Lt);
                    }
                }
                '=' => {
                    self.chars.next();
                    if let Some(&'=') = self.chars.peek() {
                        self.chars.next();
                    }
                    tokens.push(Token::Eq);
                }
                '"' | '\'' => {
                    let quote = ch;
                    self.chars.next();
                    let mut s = String::new();
                    while let Some(c) = self.chars.next() {
                        if c == quote {
                            break;
                        }
                        s.push(c);
                    }
                    tokens.push(Token::StringLit(s));
                }
                _ => {
                    let mut ident = String::new();
                    while let Some(&c) = self.chars.peek() {
                        if c.is_alphanumeric() || c == '_' || c == '-' {
                            ident.push(c);
                            self.chars.next();
                        } else {
                            break;
                        }
                    }
                    if !ident.is_empty() {
                        match ident.to_lowercase().as_str() {
                            "and" => tokens.push(Token::And),
                            "or" => tokens.push(Token::Or),
                            "not" => tokens.push(Token::Not),
                            "in" => tokens.push(Token::In),
                            _ => tokens.push(Token::Ident(ident)),
                        }
                    } else {
                        self.chars.next();
                    }
                }
            }
        }

        Ok(tokens)
    }
}

pub struct QueryParser {
    tokens: Vec<Token>,
    pos: usize,
}

impl QueryParser {
    pub fn parse(input: &str) -> Result<Expr> {
        let mut lexer = Lexer::new(input);
        let tokens = lexer.tokenize()?;
        if tokens.is_empty() {
            return Err(AppError::Query("Empty query expression".to_string()));
        }

        let mut parser = QueryParser { tokens, pos: 0 };
        let expr = parser.parse_or()?;
        if parser.pos < parser.tokens.len() {
            return Err(AppError::Query(format!(
                "Unexpected trailing tokens at position {}",
                parser.pos
            )));
        }
        Ok(expr)
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    fn consume(&mut self) -> Option<&Token> {
        let tok = self.tokens.get(self.pos);
        if tok.is_some() {
            self.pos += 1;
        }
        tok
    }

    fn parse_or(&mut self) -> Result<Expr> {
        let mut left = self.parse_and()?;

        while let Some(Token::Or) = self.peek() {
            self.consume();
            let right = self.parse_and()?;
            left = Expr::Or(Box::new(left), Box::new(right));
        }

        Ok(left)
    }

    fn parse_and(&mut self) -> Result<Expr> {
        let mut left = self.parse_unary()?;

        while let Some(Token::And) = self.peek() {
            self.consume();
            let right = self.parse_unary()?;
            left = Expr::And(Box::new(left), Box::new(right));
        }

        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<Expr> {
        if let Some(Token::Not) = self.peek() {
            self.consume();
            let operand = self.parse_unary()?;
            return Ok(Expr::Not(Box::new(operand)));
        }

        self.parse_primary()
    }

    fn parse_date_value(val: &str) -> Result<DateTime<Utc>> {
        if let Ok(dt) = DateTime::parse_from_rfc3339(val) {
            return Ok(dt.with_timezone(&Utc));
        }
        if let Ok(d) = NaiveDate::parse_from_str(val, "%Y-%m-%d") {
            return Ok(d.and_hms_opt(0, 0, 0).unwrap().and_utc());
        }
        Err(AppError::Query(format!("Cannot parse date string: {}", val)))
    }

    fn parse_primary(&mut self) -> Result<Expr> {
        match self.peek().cloned() {
            Some(Token::LParen) => {
                self.consume();
                let expr = self.parse_or()?;
                match self.consume() {
                    Some(Token::RParen) => Ok(expr),
                    _ => Err(AppError::Query("Expected closing parenthesis ')'".to_string())),
                }
            }
            Some(Token::Ident(ref name)) => {
                let name = name.clone();
                self.consume();
                let lower = name.to_lowercase();

                match lower.as_str() {
                    "pinned" => Ok(Expr::Pinned),
                    "archived" => Ok(Expr::Archived),
                    "has_link" | "has_links" => Ok(Expr::HasLink),
                    "has_code" => Ok(Expr::HasCode),
                    "has_tasks" | "has_task" => Ok(Expr::HasTasks),
                    "has_incomplete_tasks" => Ok(Expr::HasIncompleteTasks),
                    "has_attachment" | "has_attachments" => Ok(Expr::HasAttachment),
                    "has_location" => Ok(Expr::HasLocation),
                    "tag" | "tags" => {
                        match self.peek() {
                            Some(Token::In) => {
                                self.consume();
                                match self.consume() {
                                    Some(Token::LBracket) => {}
                                    _ => return Err(AppError::Query("Expected '[' after 'in'".to_string())),
                                }
                                let mut tags = Vec::new();
                                while let Some(tok) = self.peek().cloned() {
                                    if tok == Token::RBracket {
                                        self.consume();
                                        break;
                                    }
                                    match tok {
                                        Token::StringLit(s) | Token::Ident(s) => {
                                            self.consume();
                                            tags.push(s);
                                            if let Some(Token::Comma) = self.peek() {
                                                self.consume();
                                            }
                                        }
                                        _ => return Err(AppError::Query("Expected tag item in list".to_string())),
                                    }
                                }
                                Ok(Expr::TagIn(tags))
                            }
                            Some(Token::Eq) => {
                                self.consume();
                                match self.consume() {
                                    Some(Token::StringLit(s)) | Some(Token::Ident(s)) => Ok(Expr::TagEquals(s.clone())),
                                    _ => Err(AppError::Query("Expected tag value".to_string())),
                                }
                            }
                            _ => Err(AppError::Query("Expected 'in' or '==' after 'tag'".to_string())),
                        }
                    }
                    "created_at" => {
                        let op = self.consume().cloned().ok_or_else(|| AppError::Query("Expected comparison operator".to_string()))?;
                        let val = match self.consume() {
                            Some(Token::StringLit(s)) | Some(Token::Ident(s)) => s.clone(),
                            _ => return Err(AppError::Query("Expected date string after operator".to_string())),
                        };
                        let dt = Self::parse_date_value(&val)?;
                        match op {
                            Token::Gte | Token::Gt => Ok(Expr::CreatedAtGte(dt)),
                            Token::Lte | Token::Lt => Ok(Expr::CreatedAtLte(dt)),
                            _ => Err(AppError::Query("Unsupported comparison operator for created_at".to_string())),
                        }
                    }
                    "updated_at" => {
                        let op = self.consume().cloned().ok_or_else(|| AppError::Query("Expected comparison operator".to_string()))?;
                        let val = match self.consume() {
                            Some(Token::StringLit(s)) | Some(Token::Ident(s)) => s.clone(),
                            _ => return Err(AppError::Query("Expected date string after operator".to_string())),
                        };
                        let dt = Self::parse_date_value(&val)?;
                        match op {
                            Token::Gte | Token::Gt => Ok(Expr::UpdatedAtGte(dt)),
                            Token::Lte | Token::Lt => Ok(Expr::UpdatedAtLte(dt)),
                            _ => Err(AppError::Query("Unsupported comparison operator for updated_at".to_string())),
                        }
                    }
                    _ => Err(AppError::Query(format!("Unknown identifier '{}'", name))),
                }
            }
            _ => Err(AppError::Query(format!(
                "Unexpected token at position {:?}",
                self.peek()
            ))),
        }
    }
}
